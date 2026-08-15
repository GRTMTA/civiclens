const mapRoute = window.location.pathname === "/map"

void import(mapRoute ? "./dashboard-entry" : "./main")
