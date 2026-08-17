from __future__ import annotations

import hmac
import math
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any

import duckdb
from fastapi import Depends, FastAPI, HTTPException, Path as ApiPath, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "dpwh.duckdb"
bearer = HTTPBearer(auto_error=False)


def json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return value


def query_rows(connection: duckdb.DuckDBPyConnection, sql: str, params: list[Any]) -> list[dict[str, Any]]:
    result = connection.execute(sql, params)
    columns = [column[0] for column in result.description]
    return [dict(zip(columns, row, strict=True)) for row in result.fetchall()]


def public_record(row: dict[str, Any]) -> dict[str, Any]:
    record = {key: json_value(value) for key, value in row.items() if not key.startswith("_")}
    record["contractId"] = row["_contract_id"]
    record["latitude"] = row["_latitude"]
    record["longitude"] = row["_longitude"]
    return record


def value(record: dict[str, Any], *names: str) -> Any:
    return next((record[name] for name in names if record.get(name) is not None), None)


def text_value(record: dict[str, Any], *names: str, fallback: str = "") -> str:
    item = value(record, *names)
    return str(item).strip() if item is not None and str(item).strip() else fallback


def estimated_area(latitude: float, longitude: float) -> dict[str, Any]:
    radius_meters = 50
    latitude_radius = radius_meters / 111_320
    cosine = math.cos(math.radians(latitude))
    longitude_radius = radius_meters / (111_320 * cosine) if cosine else latitude_radius
    coordinates = [[
        longitude + math.cos(index / 24 * math.tau) * longitude_radius,
        latitude + math.sin(index / 24 * math.tau) * latitude_radius,
    ] for index in range(25)]
    return {"type": "Polygon", "coordinates": [coordinates]}


def map_feature(row: dict[str, Any]) -> dict[str, Any]:
    project = public_record(row)
    contract_id = str(row["_contract_id"])
    latitude = float(row["_latitude"])
    longitude = float(row["_longitude"])
    return {
        "type": "Feature",
        "id": f"dpwh-{contract_id}",
        "geometry": estimated_area(latitude, longitude),
        "properties": {
            "id": f"dpwh-{contract_id}",
            "name": text_value(project, "description", fallback=f"DPWH contract {contract_id}"),
            "category": text_value(project, "category", "infraType", fallback="unknown"),
            "source": "DPWH Transparency Portal via BetterGov archive",
            "status": text_value(project, "status", fallback="Unknown"),
            "recorded_coordinates": [longitude, latitude],
            "geometry_kind": "estimated",
        },
    }


def map_detail(row: dict[str, Any]) -> dict[str, Any]:
    project = public_record(row)
    location = project.get("location") if isinstance(project.get("location"), dict) else {}
    contract_id = str(row["_contract_id"])
    return {
        "id": f"dpwh-{contract_id}",
        "source": "DPWH Transparency Portal via BetterGov archive",
        "source_url": f"https://transparency.dpwh.gov.ph/projects/{contract_id}",
        "name": text_value(project, "description", fallback=f"DPWH contract {contract_id}"),
        "category": text_value(project, "category", "infraType", fallback="unknown"),
        "description": text_value(project, "description"),
        "agency": "Department of Public Works and Highways",
        "contractor": value(project, "contractor"),
        "budget": value(project, "budget"),
        "amount_paid": value(project, "amountPaid", "amount_paid"),
        "status": text_value(project, "status", fallback="Unknown"),
        "progress": value(project, "progress"),
        "location": location.get("province") or location.get("region") or "Location not provided",
        "latitude": row["_latitude"],
        "longitude": row["_longitude"],
        "contract_id": contract_id,
        "start_date": value(project, "startDate", "start_date"),
        "completion_date": value(project, "completionDate", "completion_date"),
        "infrastructure_year": value(project, "infraYear", "infrastructure_year"),
        "program_name": value(project, "programName", "program_name"),
        "source_of_funds": value(project, "sourceOfFunds", "source_of_funds"),
        "geometry_kind": "estimated",
    }


def create_app(
    database_path: Path | str | None = None,
    api_token: str | None = None,
) -> FastAPI:
    db_path = Path(database_path or os.getenv("DPWH_DB_PATH", DEFAULT_DB_PATH)).resolve()
    configured_token = api_token if api_token is not None else os.getenv("DPWH_API_TOKEN", "").strip()
    app = FastAPI(title="CivicLens DPWH Archive API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    def authorize(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> None:
        if not configured_token:
            return
        supplied = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
        if not hmac.compare_digest(supplied, configured_token):
            raise HTTPException(
                status_code=401,
                detail="Invalid or missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    def connect() -> duckdb.DuckDBPyConnection:
        if not db_path.is_file():
            raise HTTPException(status_code=503, detail="DPWH database is not available")
        return duckdb.connect(str(db_path), read_only=True)

    @app.get("/health")
    def health() -> dict[str, Any]:
        try:
            with connect() as connection:
                row = connection.execute(
                    "SELECT row_count, coordinate_count, built_at, source_url FROM build_metadata LIMIT 1"
                ).fetchone()
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=503, detail="DPWH database is not readable") from error
        return {
            "status": "ok",
            "projects": row[0],
            "projectsWithCoordinates": row[1],
            "builtAt": json_value(row[2]),
            "source": row[3],
        }

    @app.get("/projects", dependencies=[Depends(authorize)])
    def projects(
        south: Annotated[float, Query(ge=-90, le=90)],
        west: Annotated[float, Query(ge=-180, le=180)],
        north: Annotated[float, Query(ge=-90, le=90)],
        east: Annotated[float, Query(ge=-180, le=180)],
        page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
        limit: Annotated[int, Query(ge=1, le=5_000)] = 500,
    ) -> dict[str, list[dict[str, Any]]]:
        if south >= north or west >= east:
            raise HTTPException(status_code=400, detail="south/west must be less than north/east")
        offset = (page - 1) * limit
        with connect() as connection:
            rows = query_rows(
                connection,
                """
                SELECT * FROM projects
                WHERE _latitude BETWEEN ? AND ? AND _longitude BETWEEN ? AND ?
                ORDER BY _contract_id, _latitude, _longitude
                LIMIT ? OFFSET ?
                """,
                [south, north, west, east, limit, offset],
            )
        return {"data": [public_record(row) for row in rows]}

    @app.get("/projects/{contract_id}", dependencies=[Depends(authorize)])
    def project(
        contract_id: Annotated[str, ApiPath(min_length=1, max_length=256)],
    ) -> dict[str, dict[str, Any]]:
        normalized_id = contract_id.strip()
        if not normalized_id:
            raise HTTPException(status_code=404, detail="Project not found")
        with connect() as connection:
            rows = query_rows(
                connection,
                "SELECT * FROM projects WHERE _contract_id = ? ORDER BY _latitude NULLS LAST LIMIT 1",
                [normalized_id],
            )
        if not rows:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"data": public_record(rows[0])}

    @app.get("/map/projects")
    def map_projects(
        south: Annotated[float, Query(ge=-90, le=90)],
        west: Annotated[float, Query(ge=-180, le=180)],
        north: Annotated[float, Query(ge=-90, le=90)],
        east: Annotated[float, Query(ge=-180, le=180)],
        limit: Annotated[int, Query(ge=1, le=500)] = 500,
    ) -> dict[str, Any]:
        if south >= north or west >= east:
            raise HTTPException(status_code=400, detail="south/west must be less than north/east")
        with connect() as connection:
            rows = query_rows(
                connection,
                """
                SELECT * FROM projects
                WHERE _latitude BETWEEN ? AND ? AND _longitude BETWEEN ? AND ?
                ORDER BY _contract_id, _latitude, _longitude
                LIMIT ?
                """,
                [south, north, west, east, limit],
            )
        return {
            "type": "FeatureCollection",
            "features": [map_feature(row) for row in rows],
            "truncated": len(rows) == limit,
        }

    @app.get("/map/projects/{contract_id}")
    def map_project(
        contract_id: Annotated[str, ApiPath(min_length=1, max_length=256)],
    ) -> dict[str, Any]:
        normalized_id = contract_id.strip()
        with connect() as connection:
            rows = query_rows(
                connection,
                "SELECT * FROM projects WHERE _contract_id = ? ORDER BY _latitude NULLS LAST LIMIT 1",
                [normalized_id],
            )
        if not rows or rows[0]["_latitude"] is None or rows[0]["_longitude"] is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return map_detail(rows[0])

    return app


app = create_app()
