const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 3000;

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize SQLite database
const db = new sqlite3.Database('./database/attendance.db');

// Create tables if they don't exist, without dropping them
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS lab_new (adm_no INTEGER PRIMARY KEY, name TEXT, class_sec TEXT, "group" TEXT, timest TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS lab_exist (admission_number INTEGER PRIMARY KEY, name TEXT, class_sec TEXT, group_name TEXT)');
});

// Serve the index.ejs on the root route
app.get('/', (req, res) => {
    // Select all columns from lab_new table to display on the page
    db.all('SELECT adm_no, name, class_sec, "group", timest FROM lab_new', [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error retrieving data from database.');
        } else {
            res.render('index', { records: rows });
        }
    });
});

// Check number route (for AJAX request)
app.get('/checkNumber/:number', (req, res) => {
    const number = req.params.number;

    // Check if number exists in lab_exist table
    db.get('SELECT admission_number, name, class_sec, group_name FROM lab_exist WHERE admission_number = ?', [number], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ exists: false, error: 'Error checking number in database.' });
        } else if (!row) {
            // If number does not exist in lab_exist table
            console.log(`Number ${number} not found in lab_exist table.`);
            res.json({ exists: false });
        } else {
            // If number exists in lab_exist table
            res.json({ exists: true, name: row.name, class_sec: row.class_sec, group_name: row.group_name });
        }
    });
});

// Save number route (for AJAX request)
app.post('/saveNumber/:number', (req, res) => {
    const number = req.params.number;

    // Fetch the name, class_sec, and group_name associated with the number from lab_exist
    db.get('SELECT name, class_sec, group_name FROM lab_exist WHERE admission_number = ?', [number], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching data from database.');
        } else if (!row) {
            res.status(404).send('Data not found for the given number.');
        } else {
            const { name, class_sec, group_name } = row;
            const timest = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'); // Get the current date and time in IST

            // Insert the number, name, class_sec, group_name, and timest into lab_new table
            db.run('INSERT INTO lab_new (adm_no, name, class_sec, "group", timest) VALUES (?, ?, ?, ?, ?)', [number, name, class_sec, group_name, timest], (err) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Error storing data in the database.');
                } else {
                    console.log(`Number ${number} (${name}, ${class_sec}, ${group_name}) automatically submitted and stored in lab_new table at ${timest}.`);
                    // Redirect to the homepage to refresh the page after save
                    res.redirect('/');
                }
            });
        }
    });
});

// Download CSV route
app.get('/download/:date', (req, res) => {
    const selectedDate = req.params.date;
    const filePath = './lab_new.csv';
    const rows = [];

    // Fetch all columns from lab_new table for the selected date
    db.all('SELECT adm_no, name, class_sec, "group", timest FROM lab_new WHERE DATE(timest) = ?', [selectedDate], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error retrieving data from database.');
        } else {
            // Convert rows array to CSV format
            const csvHeader = 'adm_no,name,class_sec,group,timest\n';
            const csvData = rows.map(row => `${row.adm_no},${row.name},${row.class_sec},${row.group},${row.timest}`).join('\n');
            const csvContent = csvHeader + csvData;

            // Write CSV data to a file
            fs.writeFileSync(filePath, csvContent);

            // Send the file as response
            res.download(filePath, 'lab_new.csv', (err) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Error downloading file.');
                }

                // Clean up: delete the file after download
                fs.unlinkSync(filePath);
            });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
