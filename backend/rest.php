<?php
header("Content-Type:application/json");
header("Access-Control-Allow-Origin: *");

class HaalendarDB extends SQLite3
{
  function __construct()
  {
    $this->open('db.db');
  }
}

if (isset($_GET['op'])) {
  if ($_GET['op'] == 'today') {
    today('\'' . $_GET['daterequested'] . '\'');
  } elseif ($_GET['op'] == 'createEvent') {
    createEvent(
      isset($_GET['title']) ? '\'' . $_GET['title'] . '\'' : 'null',
      isset($_GET['datefrom']) ? '\'' . $_GET['datefrom'] . '\'' : 'null',
      isset($_GET['timefrom']) ? '\'' . $_GET['timefrom'] . '\'' : 'null',
      isset($_GET['dateto']) ? '\'' . $_GET['dateto'] . '\'' : 'null',
      isset($_GET['timeto']) ? '\'' . $_GET['timeto'] . '\'' : 'null',
      isset($_GET['allday']) ? $_GET['allday'] : 'null',
      isset($_GET['location']) ? '\'' . $_GET['location'] . '\'' : 'null',
      isset($_GET['color']) ? $_GET['color'] : 'null',
      isset($_GET['description'])  ? '\'' . $_GET['description'] . '\'' : 'null',
      isset($_GET['repeat'])  ? $_GET['repeat'] : 0
    );
  } elseif ($_GET['op'] == 'updateEvent') {
    updateEvent(
      isset($_GET['eventId']) ?  $_GET['eventId'] : 'null',
      isset($_GET['title']) ? '\'' . $_GET['title'] . '\'' : 'null',
      isset($_GET['datefrom']) ? '\'' . $_GET['datefrom'] . '\'' : 'null',
      isset($_GET['timefrom']) ? '\'' . $_GET['timefrom'] . '\'' : 'null',
      isset($_GET['dateto']) ? '\'' . $_GET['dateto'] . '\'' : 'null',
      isset($_GET['timeto']) ? '\'' . $_GET['timeto'] . '\'' : 'null',
      isset($_GET['allday']) ? $_GET['allday'] : 'null',
      isset($_GET['location']) ? '\'' . $_GET['location'] . '\'' : 'null',
      isset($_GET['color']) ? $_GET['color'] : 'null',
      isset($_GET['description'])  ? '\'' . $_GET['description'] . '\'' : 'null',
      isset($_GET['repeat'])  ? $_GET['repeat'] : 0
    );
  } elseif ($_GET['op'] == 'getColors') {
    getColors();
  } elseif ($_GET['op'] == 'getEventById') {
    getEventById('\'' . $_GET['requestedEventId'] . '\'');
  } elseif ($_GET['op'] == 'deleteEvent') {
    deleteEvent($_GET['requestedEventId'],   $_GET['allEvents'], '\'' . $_GET['requestedDate'] . '\'');
  } elseif ($_GET['op'] == 'cloneEvent') {
    cloneEvent($_GET['eventId']);
  } elseif ($_GET['op'] == 'getActiveEvents') {
    getActiveEvents();
  } elseif ($_GET['op'] == 'trash') {
    trash();
  } elseif ($_GET['op'] == 'restoreEvent') {
    restoreEvent($_GET['eventId']);
  } elseif ($_GET['op'] == 'getExpiredEvents') {
    getExpiredEvents('\'' . $_GET['daterequested'] . '\'');
  } else {
    echo json_encode('Haalendar REST API');
  }
} else {
  echo json_encode('Haalendar REST API');
}

function cloneEvent($eventId)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->exec('insert into events (title, datefrom, timefrom, dateto, timeto, allday, location, color, description, deleted, create_ts) select title, datefrom, timefrom, dateto, timeto, allday, location, color, description, deleted, \'' . date('m/d/Y H:i:s') . ' ' . date_default_timezone_get() . '\' from events where id = ' . $eventId);
  $results =
    $db->query('select last_insert_rowid() last_insert_id');
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $last_insert_id = $row['last_insert_id'];
  }
  $db->close();
  unset($db);
  toLog('Event #' . $eventId . ' has been cloned. Clone id: #' . $last_insert_id . '.', null);
  echo ('{"clonedEventId":' . $last_insert_id . '}');
}

function deleteEvent($requestedEventId, $allEvents, $requestedDate)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query('select datefrom, daily, weekly, monthly, annually from events where id = ' . $requestedEventId);
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $datefrom = is_null($row['datefrom']) ? 0 : $row['datefrom'];
    $daily =  is_null($row['daily']) ? 0 : $row['daily'];
    $weekly = is_null($row['weekly']) ? 0 : $row['weekly'];
    $monthly = is_null($row['monthly']) ? 0 : $row['monthly'];
    $annually = is_null($row['annually']) ? 0 : $row['annually'];
  }
  if (($daily == 0 && $weekly == 0 && $monthly == 0 && $annually == 0) || $allEvents == 1) {
    $results =
      $db->exec(
        'update events set deleted = 1 where id = ' . $requestedEventId
      );
    toLog('Event #' . $requestedEventId . ' has been completely deleted.', null);
  } else {
    $results =
      $db->exec(
        'insert into exclusions (event_id, dt) values (' . $requestedEventId . ', ' . $requestedDate . ')'
      );

    toLog('Instance of recurring event #' . $requestedEventId . ' for \'' . $requestedDate . '\' has been deleted.', null);

    cleanExclusions($requestedEventId, $datefrom, $daily == 1 ? ' day' : ($weekly == 1 ? ' week' : ($monthly == 1 ? ' month' : ($annually == 1 ? ' year' : ' day'))));
  }

  $db->close();
  unset($db);
}

function cleanExclusions($eventId, $dateFrom, $intervalString)
{
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query('select event_id, dt from exclusions where event_id = ' . $eventId . ' order by dt');
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $currentDateFrom = new DateTime($dateFrom);

  foreach ($rows as $exclusion) {

    $dt = new DateTime($exclusion['dt']);
    $modifier = '+ 1 ' . $intervalString;

    if ($dt == $currentDateFrom) {
      $currentDateFrom = $dt->modify($modifier);
      $results =
        $db->exec(
          'delete from exclusions where event_id = ' . $eventId . ' and dt = \'' . $exclusion['dt'] . '\''
        );
    } else {
      break;
    }
  }

  $results =
    $db->exec(
      'update events set datefrom = \'' . $currentDateFrom->format('Y-m-d') . '\', dateto = \'' . $currentDateFrom->format('Y-m-d') . '\' where id = ' . $eventId
    );

  $db->close();
  unset($db);
}

function getEventById($requestedEventId)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query(
      'select id, title, datefrom, timefrom, dateto, timeto, allday, location, color colorid, (select color from colors c where c.id = t.color) color, description, deleted, create_ts, daily, weekly, monthly, annually, last_update_ts FROM events t where id = ' . $requestedEventId
    );
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  echo json_encode($rows);
}

function today($dateRequested)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query(
      'select id, title, datefrom, timefrom, dateto, timeto, allday, location, (select color from colors c where c.id = t.color) color, description, deleted, create_ts, daily, weekly, monthly, annually, last_update_ts FROM events t where (' . $dateRequested . ' not in ( select dt from exclusions e where e.event_id = t.id )) and (( deleted = 0 and ' . $dateRequested . ' between datefrom and dateto and daily is null and weekly is null and monthly is null and annually is null ) or ( ( deleted = 0 and daily = 1 and ' . $dateRequested . ' >=  datefrom ) or ( deleted = 0 and weekly = 1 and Strftime(\'%w\', Date(' . $dateRequested . ')) = Strftime(\'%w\', datefrom)  and ' . $dateRequested . ' >=  datefrom ) or ( deleted = 0 and monthly = 1 and Strftime(\'%d\', Date(' . $dateRequested . ')) = Strftime(\'%d\', datefrom)  and ' . $dateRequested . ' >=  datefrom ) or ( deleted = 0 and annually = 1 and Strftime(\'%d\', Date(' . $dateRequested . ')) = Strftime(\'%d\', Date(datefrom)) and Strftime(\'%m\', Date(' . $dateRequested . ')) = Strftime(\'%m\', Date(datefrom))  and ' . $dateRequested . ' >=  datefrom  ))) order by 9, 2'
    );
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  echo json_encode($rows);
}

function createEvent($title, $datefrom, $timefrom, $dateto, $timeto, $allday, $location, $color, $description, $repeat)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $daily = $weekly = $monthly = $annually = 'null';
  switch ($repeat) {
    case 1:
      $daily = 1;
      break;
    case 2:
      $weekly = 1;
      break;
    case 3:
      $monthly = 1;
      break;
    case 4:
      $annually = 1;
      break;
  }
  $sql = 'insert into events (title, datefrom, timefrom, dateto, timeto, allday, location, color, description, deleted, create_ts, daily, weekly, monthly, annually) values (' . $title . ',' . $datefrom . ',' . $timefrom . ',' . $dateto . ',' . $timeto . ',' . $allday . ',' . $location . ',' . $color . ',' . $description . ',0,\'' . date('m/d/Y H:i:s') . ' ' . date_default_timezone_get() . '\',' . $daily . ',' . $weekly . ',' . $monthly . ',' . $annually .  ')';
  $ret = $db->exec($sql);
  if (!$ret) {
    echo $db->lastErrorMsg();
  }
  $db->close();
  unset($db);
}

function getColors()
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results = $db->query('select id, color from colors');
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  echo json_encode($rows);
}

function updateEvent($eventId, $title, $datefrom, $timefrom, $dateto, $timeto, $allday, $location, $color, $description, $repeat)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $daily = $weekly = $monthly = $annually = 'null';
  switch ($repeat) {
    case 1:
      $daily = 1;
      break;
    case 2:
      $weekly = 1;
      break;
    case 3:
      $monthly = 1;
      break;
    case 4:
      $annually = 1;
      break;
  }
  $eventBeforeUpdate = eventToArray($eventId);
  $sql = 'update events set title = ' . $title . ', datefrom = ' . $datefrom . ', timefrom = ' . $timefrom . ', dateto = ' . $dateto . ', timeto = ' . $timeto . ', allday = ' . $allday . ', location = ' . $location . ', color = ' . $color . ', description = ' . $description . ', daily = ' . $daily . ', weekly = ' . $weekly . ', monthly = ' . $monthly . ', annually = ' . $annually . ', last_update_ts = \'' . date('m/d/Y H:i:s') . ' ' . date_default_timezone_get() . '\' where id = ' . $eventId;
  $ret = $db->exec($sql);
  if (!$ret) {
    echo $db->lastErrorMsg();
  }
  $db->close();
  unset($db);
  $eventAfterUpdate = eventToArray($eventId);
  toLog('Event #' . $eventId . ' has been updated.', "From:\r\n" . json_encode($eventBeforeUpdate) . "\r\nTo:\r\n" . json_encode($eventAfterUpdate));
}

function toLog($msg, $data)
{
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $sql = 'insert into log (ts, msg, data) values (\'' . date('m/d/Y H:i:s') . ' ' . date_default_timezone_get() . '\', \'' . $msg . '\', \'' . $data . '\')';
  $ret = $db->exec($sql);
  if (!$ret) {
    echo $db->lastErrorMsg();
  }
  $db->close();
  unset($db);
}


function eventToArray($eventId)
{
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query(
      'select id, title, datefrom, timefrom, dateto, timeto, allday, location, color colorid, (select color from colors c where c.id = t.color) color, description, deleted, create_ts, daily, weekly, monthly, annually, last_update_ts FROM events t where id = ' . $eventId
    );
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  return $rows;
}

function getActiveEvents()
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query(
      'select id, title, datefrom from events where deleted = 0'
    );
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  echo json_encode($rows);
}

function trash()
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query(
      'select id, title, datefrom, timefrom, dateto, timeto, allday, location, (select color from colors c where c.id = t.color) color, description, deleted, create_ts, daily, weekly, monthly, annually, last_update_ts FROM events t where deleted = 1 order by 12 desc'
    );
  $rows = array();
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
  }
  $db->close();
  unset($db);
  echo json_encode($rows);
}

function restoreEvent($eventId)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $sql = 'update events set deleted = 0 where id = ' . $eventId;
  $ret = $db->exec($sql);
  if (!$ret) {
    echo $db->lastErrorMsg();
  }
  $db->close();
  unset($db);
}

function getExpiredEvents($dateRequested)
{
  header("HTTP/1.1 200");
  $db = new HaalendarDB();
  $db->busyTimeout(2000);
  $results =
    $db->query('select count(*) expired_events_count from events where deleted = 0 and datefrom < ' . $dateRequested);
  while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
    $expired_events_count = $row['expired_events_count'];
  }
  $db->close();
  unset($db);
  echo ('{
    "expiredEventsCount": ' . $expired_events_count . '}');
}
