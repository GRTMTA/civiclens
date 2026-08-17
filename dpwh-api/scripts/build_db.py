from __future__ import annotations

import os
import shutil
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb

SOURCE_URL = (
    "https://huggingface.co/datasets/bettergovph/dpwh-transparency-data/resolve/main/"
    "dpwh_transparency_data_all_details.parquet"
)
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = ROOT / "data" / "dpwh.duckdb"
CONTRACT_ALIASES = ("contractId", "contract_id", "id")
LATITUDE_ALIASES = ("latitude", "lat")
LONGITUDE_ALIASES = ("longitude", "lng", "lon")


def download(source_url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".download")
    request = urllib.request.Request(source_url, headers={"User-Agent": "CivicLens-DPWH-Builder/1.0"})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
            if partial.stat().st_size == 0:
                raise RuntimeError("Downloaded Parquet file is empty")
            partial.replace(destination)
            return
        except Exception:
            partial.unlink(missing_ok=True)
            if attempt == 3:
                raise
            time.sleep(attempt * 2)


def quoted(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def resolve_column(columns: list[str], aliases: tuple[str, ...], label: str) -> str:
    by_lowercase = {column.lower(): column for column in columns}
    for alias in aliases:
        if alias.lower() in by_lowercase:
            return by_lowercase[alias.lower()]
    raise RuntimeError(f"Dataset does not contain a {label} column; found: {', '.join(columns)}")


def build_database(parquet_path: Path, database_path: Path, source_url: str) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_database = database_path.with_suffix(".building.duckdb")
    temporary_database.unlink(missing_ok=True)
    connection = duckdb.connect(str(temporary_database))
    try:
        schema = connection.execute(
            "DESCRIBE SELECT * FROM read_parquet(?)", [str(parquet_path)]
        ).fetchall()
        columns = [row[0] for row in schema]
        reserved = {"_contract_id", "_latitude", "_longitude"}
        if reserved.intersection(columns):
            raise RuntimeError("Dataset uses a reserved normalized column name")
        contract_column = resolve_column(columns, CONTRACT_ALIASES, "contract ID")
        latitude_column = resolve_column(columns, LATITUDE_ALIASES, "latitude")
        longitude_column = resolve_column(columns, LONGITUDE_ALIASES, "longitude")
        contract_sql = quoted(contract_column)
        latitude_sql = quoted(latitude_column)
        longitude_sql = quoted(longitude_column)

        connection.execute(
            f"""
            CREATE TABLE projects AS
            SELECT source.*,
                   TRIM(CAST({contract_sql} AS VARCHAR)) AS _contract_id,
                   TRY_CAST({latitude_sql} AS DOUBLE) AS _latitude,
                   TRY_CAST({longitude_sql} AS DOUBLE) AS _longitude
            FROM read_parquet(?) AS source
            WHERE NULLIF(TRIM(CAST({contract_sql} AS VARCHAR)), '') IS NOT NULL
            """,
            [str(parquet_path)],
        )
        row_count, coordinate_count = connection.execute(
            """
            SELECT COUNT(*), COUNT(*) FILTER (
                WHERE _latitude BETWEEN -90 AND 90 AND _longitude BETWEEN -180 AND 180
            ) FROM projects
            """
        ).fetchone()
        if row_count == 0:
            raise RuntimeError("Dataset produced no project records")
        if coordinate_count == 0:
            raise RuntimeError("Dataset produced no records with valid coordinates")

        connection.execute(
            "DELETE FROM projects WHERE _latitude IS NOT NULL AND NOT (_latitude BETWEEN -90 AND 90)"
        )
        connection.execute(
            "DELETE FROM projects WHERE _longitude IS NOT NULL AND NOT (_longitude BETWEEN -180 AND 180)"
        )
        connection.execute("CREATE INDEX projects_contract_id_idx ON projects (_contract_id)")
        connection.execute("CREATE INDEX projects_latitude_idx ON projects (_latitude)")
        connection.execute("CREATE INDEX projects_longitude_idx ON projects (_longitude)")
        connection.execute(
            """
            CREATE TABLE build_metadata AS
            SELECT ?::BIGINT AS row_count,
                   ?::BIGINT AS coordinate_count,
                   ?::VARCHAR AS built_at,
                   ?::VARCHAR AS source_url
            """,
            [row_count, coordinate_count, datetime.now(timezone.utc).isoformat(), source_url],
        )
        connection.execute("CHECKPOINT")
    finally:
        connection.close()
    temporary_database.replace(database_path)


def main() -> int:
    source_url = os.getenv("DPWH_PARQUET_URL", SOURCE_URL).strip()
    database_path = Path(os.getenv("DPWH_DB_PATH", DEFAULT_DATABASE)).resolve()
    source_path_value = os.getenv("DPWH_PARQUET_PATH", "").strip()
    downloaded_path = Path(os.getenv("TMPDIR", "/tmp")) / "dpwh-all-details.parquet"
    source_path = Path(source_path_value).resolve() if source_path_value else downloaded_path
    try:
        if not source_path_value:
            print(f"Downloading DPWH archive from {source_url}", flush=True)
            download(source_url, source_path)
        print(f"Building {database_path}", flush=True)
        build_database(source_path, database_path, source_url)
        print(f"Built {database_path} ({database_path.stat().st_size:,} bytes)", flush=True)
        return 0
    except Exception as error:
        print(f"DPWH database build failed: {error}", file=sys.stderr)
        return 1
    finally:
        if not source_path_value:
            source_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
