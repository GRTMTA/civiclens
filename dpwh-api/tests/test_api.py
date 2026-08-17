from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from app import create_app
from scripts.build_db import build_database


@pytest.fixture
def database(tmp_path: Path) -> Path:
    parquet = tmp_path / "sample.parquet"
    database_path = tmp_path / "sample.duckdb"
    connection = duckdb.connect()
    connection.execute("""
        CREATE TABLE sample AS SELECT * FROM (VALUES
          ('A-1', 'Cebu bridge', 'bridge', 'Ongoing', 1000.0, 250.0, 25.0,
           {'province': 'Cebu', 'region': 'Region VII'}, 10.31, 123.89, DATE '2025-01-01'),
          ('B-2', 'Bohol road', 'road', 'Completed', 2000.0, 2000.0, 100.0,
           {'province': 'Bohol', 'region': 'Region VII'}, 9.65, 123.85, DATE '2024-01-01')
        ) AS rows(contractId, description, category, status, budget, amountPaid,
                  progress, location, latitude, longitude, startDate)
    """)
    destination = str(parquet).replace("'", "''")
    connection.execute(f"COPY sample TO '{destination}' (FORMAT PARQUET)")
    connection.close()
    build_database(parquet, database_path, "test-fixture")
    return database_path


@pytest.fixture
def client(database: Path) -> TestClient:
    return TestClient(create_app(database, "test-token"))


def auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_health_is_public(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["projectsWithCoordinates"] == 2


def test_projects_require_matching_bearer_token(client: TestClient) -> None:
    assert client.get("/projects", params={
        "south": 9, "west": 123, "north": 11, "east": 125,
    }).status_code == 401
    assert client.get("/projects", headers={"Authorization": "Bearer wrong"}, params={
        "south": 9, "west": 123, "north": 11, "east": 125,
    }).status_code == 401


def test_viewport_filters_and_preserves_details(client: TestClient) -> None:
    response = client.get("/projects", headers=auth(), params={
        "south": 10, "west": 123, "north": 11, "east": 125, "limit": 10,
    })
    assert response.status_code == 200
    projects = response.json()["data"]
    assert [project["contractId"] for project in projects] == ["A-1"]
    assert projects[0]["location"]["province"] == "Cebu"
    assert projects[0]["startDate"] == "2025-01-01"


def test_pagination_is_deterministic(client: TestClient) -> None:
    params = {"south": 9, "west": 123, "north": 11, "east": 125, "limit": 1}
    first = client.get("/projects", headers=auth(), params=params).json()["data"]
    second = client.get("/projects", headers=auth(), params={**params, "page": 2}).json()["data"]
    assert first[0]["contractId"] == "A-1"
    assert second[0]["contractId"] == "B-2"


def test_project_detail_and_not_found(client: TestClient) -> None:
    response = client.get("/projects/A-1", headers=auth())
    assert response.status_code == 200
    assert response.json()["data"]["description"] == "Cebu bridge"
    assert client.get("/projects/missing", headers=auth()).status_code == 404


def test_invalid_viewport_is_rejected(client: TestClient) -> None:
    response = client.get("/projects", headers=auth(), params={
        "south": 11, "west": 123, "north": 10, "east": 125,
    })
    assert response.status_code == 400


def test_browser_map_routes_are_public_and_normalized(client: TestClient) -> None:
    response = client.get("/map/projects", headers={"Origin": "http://localhost:5173"}, params={
        "south": 10, "west": 123, "north": 11, "east": 125,
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    feature = response.json()["features"][0]
    assert feature["id"] == "dpwh-A-1"
    assert feature["properties"]["recorded_coordinates"] == [123.89, 10.31]

    detail = client.get("/map/projects/A-1").json()
    assert detail["id"] == "dpwh-A-1"
    assert detail["amount_paid"] == 250.0
    assert detail["location"] == "Cebu"
