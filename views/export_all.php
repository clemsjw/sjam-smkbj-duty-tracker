<?php
session_start();
include('connection.php');

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="database_export_' . date('Y-m-d') . '.csv"');

$output = fopen('php://output', 'w');

// Export calon table
fputcsv($output, array('=== CALON TABLE ==='));
$columns = mysqli_query($condb, "SHOW COLUMNS FROM calon");
$headers = array();
while ($col = mysqli_fetch_assoc($columns)) {
    $headers[] = $col['Field'];
}
fputcsv($output, $headers);

$data = mysqli_query($condb, "SELECT * FROM calon");
while ($row = mysqli_fetch_assoc($data)) {
    fputcsv($output, $row);
}

// Export pengguna table
fputcsv($output, array());
fputcsv($output, array('=== PENGGUNA TABLE ==='));
$columns = mysqli_query($condb, "SHOW COLUMNS FROM pengguna");
$headers = array();
while ($col = mysqli_fetch_assoc($columns)) {
    $headers[] = $col['Field'];
}
fputcsv($output, $headers);

$data = mysqli_query($condb, "SELECT * FROM pengguna");
while ($row = mysqli_fetch_assoc($data)) {
    fputcsv($output, $row);
}

// Export jawatan table
fputcsv($output, array());
fputcsv($output, array('=== JAWATAN TABLE ==='));
$columns = mysqli_query($condb, "SHOW COLUMNS FROM jawatan");
$headers = array();
while ($col = mysqli_fetch_assoc($columns)) {
    $headers[] = $col['Field'];
}
fputcsv($output, $headers);

$data = mysqli_query($condb, "SELECT * FROM jawatan");
while ($row = mysqli_fetch_assoc($data)) {
    fputcsv($output, $row);
}

// Export undian table
fputcsv($output, array());
fputcsv($output, array('=== UNDIAN TABLE ==='));
$columns = mysqli_query($condb, "SHOW COLUMNS FROM undian");
$headers = array();
while ($col = mysqli_fetch_assoc($columns)) {
    $headers[] = $col['Field'];
}
fputcsv($output, $headers);

$data = mysqli_query($condb, "SELECT * FROM undian");
while ($row = mysqli_fetch_assoc($data)) {
    fputcsv($output, $row);
}

fclose($output);
mysqli_close($condb);
exit;
?>