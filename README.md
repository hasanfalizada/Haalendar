# Haalendar
* Simple light-weight self-hosted desktop web-calendar for single person.
* No installation, full control over DB, open-source.
* SQLite support for PHP must be enabled on Windows machines (https://php.net/manual/en/sqlite3.installation.php).
* Demo: <a href="http://haalendar.demo.alizada.xyz" target="_blank">http://haalendar.demo.alizada.xyz</a> (database is being cleaned every 30 minutes).
    
Build instructions:
1. Go to `frontend` folder and build Angular side: `ng build --prod --baseHref /haalendar/`
2. Copy `frontend/dist/haalendar/` folder to the `<root of your web-server>`.
3. Copy `backend` folder to the `<root of your web-server>/haalendar/`.

Update instructions:
1. Frontend: clean `<root of your web-server>/haalendar/` (except `backend` folder) and copy from `fronted/dist/haalendar`.
2. Backend: overwrite `backend/rest.php` with new one.
