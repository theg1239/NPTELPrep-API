import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import { logger } from './logger.js';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());

const allowedOrigins = [
    'http://localhost:3001',
    'https://examcooker.acmvit.in',
    'http://localhost:3000',
    'http://localhost:4000'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
};

app.use(cors(corsOptions));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(express.static('public'));

const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                course_code VARCHAR(50) UNIQUE NOT NULL,
                course_name VARCHAR(255) NOT NULL
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS assignments (
                id SERIAL PRIMARY KEY,
                course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
                week_number INTEGER NOT NULL,
                assignment_title VARCHAR(255) NOT NULL,
                file_path TEXT,
                UNIQUE(course_id, week_number, assignment_title)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
                question_number INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                correct_option TEXT NOT NULL,
                UNIQUE(assignment_id, question_number)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS options (
                id SERIAL PRIMARY KEY,
                question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
                option_number CHAR(1) NOT NULL,
                option_text TEXT NOT NULL,
                UNIQUE(question_id, option_number)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS scraping_progress (
                id SERIAL PRIMARY KEY,
                total_courses INTEGER DEFAULT 0,
                processed_courses INTEGER DEFAULT 0,
                total_assignments INTEGER DEFAULT 0,
                processed_assignments INTEGER DEFAULT 0,
                total_questions INTEGER DEFAULT 0,
                processed_questions INTEGER DEFAULT 0,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS gemini_response_times (
                id SERIAL PRIMARY KEY,
                course_code VARCHAR(50),
                assignment_title VARCHAR(255),
                response_time_ms INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query('COMMIT');
        logger.info('Database tables initialized successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`Error initializing database: ${error.message}`);
        process.exit(1);
    } finally {
        client.release();
    }
};

initializeDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coursesFilePath = path.join(__dirname, 'public', 'courses.json');
let totalCoursesFromJSON = 0;

try {
    const coursesContent = fs.readFileSync(coursesFilePath, 'utf-8');
    const coursesData = JSON.parse(coursesContent);
    if (coursesData.data && Array.isArray(coursesData.data)) {
        totalCoursesFromJSON = coursesData.data.length;
        logger.info(`Total courses from courses.json: ${totalCoursesFromJSON}`);
    } else {
        throw new Error("Invalid structure in courses.json. Expected a 'data' array.");
    }
} catch (error) {
    logger.error(`Error reading courses.json: ${error.message}`);
    process.exit(1);
}


app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NPTEL API Server</title>
            <style>
                body {
                    background-color: #121212;
                    color: #ffffff;
                    font-family: 'Courier New', Courier, monospace;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0;
                }
                h1 {
                    font-family: 'Press Start 2P', sans-serif;
                    font-size: 2em;
                    color: #ff4757;
                    margin-bottom: 20px;
                }
                h2 {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 1.2em;
                    color: #f9ca24;
                    text-align: center;
                    margin-top: 0;
                }
                .route-list {
                    list-style-type: none;
                    padding: 0;
                    margin-top: 20px;
                    text-align: center;
                }
                .route-item {
                    margin: 10px 0;
                    font-size: 1.1em;
                }
                .route-item a {
                    color: #1e90ff;
                    text-decoration: none;
                    transition: color 0.3s ease;
                }
                .route-item a:hover {
                    color: #ff4757;
                }
                .footer {
                    margin-top: 30px;
                    font-size: 0.9em;
                    color: #7f8c8d;
                }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        </head>
        <body>
            <h1>NPTEL API Server</h1>
            <h2>Server is running</h2>
            <ul class="route-list">
                <li class="route-item"><a href="/courses">/courses</a> - List all courses</li>
                <li class="route-item"><a href="/courses/:courseCode">/courses/:courseCode</a> - Fetch specific course details</li>
                <li class="route-item"><a href="/counts">/counts</a> - Get counts of courses, assignments, questions, options</li>
                <li class="route-item"><a href="/dashboard">/dashboard</a> - View Dashboard</li>
            </ul>
            <div class="footer">Made with ♥ for public usage</div>
        </body>
        </html>
    `);
});

app.get('/courses', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.course_code, 
                c.course_name, 
                COUNT(q.id) AS question_count,
                ARRAY_AGG(DISTINCT a.week_number) AS weeks
            FROM courses c
            LEFT JOIN assignments a ON c.id = a.course_id
            LEFT JOIN questions q ON a.id = q.assignment_id
            GROUP BY c.course_code, c.course_name
            ORDER BY c.course_code;
        `;
        const { rows } = await pool.query(query);
        const formattedCourses = rows.map(row => ({
            course_code: row.course_code,
            course_name: row.course_name,
            question_count: parseInt(row.question_count, 10),
            weeks: row.weeks ? row.weeks.sort((a, b) => a - b) : []
        }));
        res.json({
            courses: formattedCourses
        });
    } catch (error) {
        logger.error(`Error fetching all courses: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching courses.' });
    }
});

app.get('/courses/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    try {
        const courseQuery = `
            SELECT 
                c.course_code, 
                c.course_name, 
                a.week_number, 
                q.question_number, 
                q.question_text, 
                q.correct_option, 
                o.option_number, 
                o.option_text
            FROM courses c
            JOIN assignments a ON c.id = a.course_id
            JOIN questions q ON a.id = q.assignment_id
            JOIN options o ON q.id = o.question_id
            WHERE c.course_code = $1
            ORDER BY a.week_number, q.question_number, o.option_number;
        `;
        const { rows } = await pool.query(courseQuery, [courseCode]);

        if (rows.length === 0) {
            res.status(404).json({ message: 'Course not found or no data available.' });
            return;
        }

        const formattedData = {
            title: rows[0].course_name,
            weeks: []
        };

        const weekMap = {};

        rows.forEach(row => {
            const weekNumber = row.week_number;
            const weekKey = `Week ${weekNumber}`;

            if (!weekMap[weekKey]) {
                weekMap[weekKey] = {
                    name: `${weekNumber}`,
                    questions: {}
                };
                formattedData.weeks.push(weekMap[weekKey]);
            }

            const questionNumber = row.question_number;

            if (!weekMap[weekKey].questions[questionNumber]) {
                weekMap[weekKey].questions[questionNumber] = {
                    question: row.question_text,
                    options: [],
                    answer: []
                };
            }

            weekMap[weekKey].questions[questionNumber].options.push(`Option ${row.option_number}: ${row.option_text}`);

            const correctOptions = row.correct_option.split(',').map(opt => opt.trim().toUpperCase());
            if (correctOptions.includes(row.option_number.toUpperCase())) {
                weekMap[weekKey].questions[questionNumber].answer.push(`Option ${row.option_number}: ${row.option_text}`);
            }
        });

        formattedData.weeks.forEach(week => {
            week.questions = Object.values(week.questions);
        });

        res.json(formattedData);
    } catch (error) {
        logger.error(`Error fetching course data for ${courseCode}: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching course data.' });
    }
});

app.get('/counts', async (req, res) => {
    try {
        const assignmentsQuery = `SELECT COUNT(*) FROM assignments;`;
        const questionsQuery = `SELECT COUNT(*) FROM questions;`;
        const optionsQuery = `SELECT COUNT(*) FROM options;`;
        const processedCoursesQuery = `SELECT COUNT(*) FROM courses;`;

        const [assignmentsResult, questionsResult, optionsResult, processedCoursesResult] = await Promise.all([
            pool.query(assignmentsQuery),
            pool.query(questionsQuery),
            pool.query(optionsQuery),
            pool.query(processedCoursesQuery)
        ]);

        const processed_courses = parseInt(processedCoursesResult.rows[0].count, 10);
        const total_assignments = parseInt(assignmentsResult.rows[0].count, 10);
        const total_questions = parseInt(questionsResult.rows[0].count, 10);
        const total_options = parseInt(optionsResult.rows[0].count, 10);

        res.json({
            total_courses_from_json: totalCoursesFromJSON,
            processed_courses,
            total_assignments,
            total_questions,
            total_options
        });
    } catch (error) {
        logger.error(`Error fetching counts: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching counts.' });
    }
});

// Get Scraping Progress
app.get('/scraping-progress', async (req, res) => {
    try {
        const query = `
            SELECT 
                total_courses, 
                processed_courses, 
                total_assignments, 
                processed_assignments, 
                total_questions, 
                processed_questions, 
                started_at, 
                updated_at
            FROM scraping_progress
            WHERE id = 1;
        `;
        const { rows } = await pool.query(query);
        if (rows.length === 0) {
            res.status(404).json({ message: 'No scraping progress found.' });
            return;
        }
        res.json({
            progress: rows[0]
        });
    } catch (error) {
        logger.error(`Error fetching scraping progress: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching scraping progress.' });
    }
});

app.get('/gemini-response-times', async (req, res) => {
    try {
        const query = `
            SELECT 
                course_code, 
                assignment_title, 
                response_time_ms, 
                timestamp
            FROM gemini_response_times
            ORDER BY timestamp DESC
            LIMIT 100;
        `;
        const { rows } = await pool.query(query);
        res.json({
            response_times: rows
        });
    } catch (error) {
        logger.error(`Error fetching Gemini response times: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching Gemini response times.' });
    }
});

app.get('/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard</title>
            <style>
                html, body {
                    height: 100%;
                    margin: 0;
                    overflow-y: hidden; 
                }
                body {
                    background-color: #121212;
                    color: #ffffff;
                    font-family: 'Courier New', Courier, monospace;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px;
                    min-height: 100vh;
                    box-sizing: border-box;
                }
                h1 {
                    font-family: 'Press Start 2P', sans-serif;
                    font-size: 2em;
                    color: #ff4757;
                    margin: 30px 0;
                    text-align: center;
                }
                .stats {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 15px;
                    margin-bottom: 20px;
                    width: 100%;
                    max-width: 900px; 
                }
                .stat {
                    background-color: #1e1e1e;
                    padding: 10px 12px;
                    border-radius: 8px;
                    text-align: center;
                    flex: 1 1 150px;
                    max-width: 180px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
                    min-height: 90px;
                }
                .stat h2 {
                    margin: 8px 0;
                    font-size: 1em;
                    color: #f9ca24;
                }
                .stat p {
                    margin: 0;
                    font-size: 1em;
                    font-weight: bold;
                }
                .progress-container {
                    width: 100%;
                    max-width: 800px;
                    background-color: #2c2c2c;
                    border-radius: 20px;
                    overflow: hidden;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
                    height: 45px;
                    position: relative;
                }
                .progress-bar {
                    height: 100%;
                    width: 0%;
                    background-color: #1abc9c;
                    transition: width 1s ease-in-out, background-color 0.5s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ffffff;
                    font-weight: bold;
                    font-size: 1em;
                }
                @media (max-width: 768px) {
                    .progress-container {
                        width: 90%;
                        max-width: 100%; 
                        height: 35px;
                    }
                    .progress-bar {
                        font-size: 0.9em; 
                    }
                }
                .eta, .current-status {
                    font-size: 1em;
                    text-align: center;
                    margin: 10px 0;
                }
                .footer {
                    font-size: 0.8em;
                    color: #7f8c8d;
                    margin: 20px 0;
                }

                @media (max-width: 768px) {
                    body {
                        padding-top: 10px;
                        overflow-y: auto;
                    }
                    h1 {
                        font-size: 1.8em;
                        margin: 15px 0;
                    }
                    .stats {
                        flex-direction: column;
                        align-items: center;
                    }
                    .stat {
                        width: 90%; 
                        max-width: 250px;
                        padding: 8px;
                        min-height: 80px;
                    }
                    .stat h2, .stat p {
                        font-size: 0.9em;
                    }
                    .progress-container {
                        width: 100%;
                        height: 40px;
                    }
                }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
        </head>
        <body>
            <h1>Dashboard</h1>
            <div class="stats">
                <div class="stat">
                    <h2>Total Courses</h2>
                    <p id="total-courses">0 / 0</p>
                </div>
                <div class="stat">
                    <h2>Total Assignments</h2>
                    <p id="total-assignments">0</p>
                </div>
                <div class="stat">
                    <h2>Total Questions</h2>
                    <p id="total-questions">0</p>
                </div>
                <div class="stat">
                    <h2>Total Options</h2>
                    <p id="total-options">0</p>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-bar" id="progress-bar">0%</div>
            </div>
            <div class="eta">
                <strong>Estimated Time Remaining:</strong> <span id="eta">Calculating...</span>
            </div>
            <div class="current-status">
                <strong>Currently Processing:</strong> <span id="current-status">None</span>
            </div>
            <div class="footer">Made with ♥</div>

            <script>
                let avgResponseTime = 15000; // Default to 15 seconds if no data
                let etaSeconds = 0; // Initialize to 0

                async function fetchCounts() {
                    try {
                        const response = await fetch('/counts');
                        if (!response.ok) throw new Error('Network response was not ok');
                        const data = await response.json();
                        return data;
                    } catch (error) {
                        console.error('Error fetching counts:', error);
                        return null;
                    }
                }

                async function fetchGeminiResponseTimes() {
                    try {
                        const response = await fetch('/gemini-response-times');
                        if (!response.ok) throw new Error('Network response was not ok');
                        const data = await response.json();
                        return data.response_times;
                    } catch (error) {
                        console.error('Error fetching Gemini response times:', error);
                        return [];
                    }
                }

                function calculateAverageResponseTime(responseTimes) {
                    if (responseTimes.length === 0) return 15000; // Default to 15 seconds if no data
                    const total = responseTimes.reduce((acc, curr) => acc + parseInt(curr.response_time_ms, 10), 0);
                    const avg = total / responseTimes.length;
                    return isFinite(avg) && avg > 0 ? avg : 15000;
                }

                async function initializeDashboard() {
                    const counts = await fetchCounts();
                    const responseTimes = await fetchGeminiResponseTimes();

                    if (!counts) {
                        document.getElementById('eta').innerText = 'Unavailable';
                        document.getElementById('current-status').innerText = 'Unavailable';
                        return;
                    }

                    const { total_courses_from_json, processed_courses, total_assignments, total_questions, total_options } = counts;
                    document.getElementById('total-courses').innerText = \`\${processed_courses} / \${total_courses_from_json}\`;
                    document.getElementById('total-assignments').innerText = total_assignments;
                    document.getElementById('total-questions').innerText = total_questions;
                    document.getElementById('total-options').innerText = total_options;

                    const progressPercentage = total_courses_from_json > 0 
                        ? Math.min((processed_courses / total_courses_from_json) * 100, 100).toFixed(2)
                        : 0;
                    const progressBar = document.getElementById('progress-bar');
                    progressBar.style.width = progressPercentage + '%';
                    progressBar.innerText = progressPercentage + '%';

                    progressBar.style.backgroundColor = progressPercentage < 50 ? '#1abc9c' :
                        progressPercentage < 80 ? '#f1c40f' : '#e74c3c';

                    avgResponseTime = calculateAverageResponseTime(responseTimes); // Calculate initial average response time
                    updateETA(total_courses_from_json, processed_courses);
                }

                function updateETA(totalCourses, processedCourses) {
                    const remainingCourses = totalCourses - processedCourses;
                    const etaMs = remainingCourses * avgResponseTime;
                    etaSeconds = Math.floor(etaMs / 1000);

                    if (etaSeconds < 0 || !isFinite(etaSeconds)) {
                        etaSeconds = 0;
                    }

                    // Reset the countdown timer display
                    document.getElementById('eta').innerText = formatTime(etaSeconds);
                }

                function formatTime(seconds) {
                    if (seconds <= 0) return 'Completed';
                    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
                    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
                    const secs = String(seconds % 60).padStart(2, '0');
                    return \`\${hours}:\${minutes}:\${secs}\`;
                }

                // Start the countdown timer
                setInterval(() => {
                    if (etaSeconds > 0) {
                        etaSeconds--;
                        document.getElementById('eta').innerText = formatTime(etaSeconds);
                    } else {
                        document.getElementById('eta').innerText = 'Completed';
                    }
                }, 1000);

                // Recalculate the average response time every 15 minutes
                setInterval(async () => {
                    const responseTimes = await fetchGeminiResponseTimes();
                    const newAvg = calculateAverageResponseTime(responseTimes);
                    if (newAvg !== avgResponseTime) {
                        avgResponseTime = newAvg;
                        const counts = await fetchCounts();
                        if (counts) {
                            const { total_courses_from_json, processed_courses } = counts;
                            const remainingCourses = total_courses_from_json - processed_courses;
                            const etaMs = remainingCourses * avgResponseTime;
                            etaSeconds = Math.floor(etaMs / 1000);
                            if (etaSeconds < 0 || !isFinite(etaSeconds)) {
                                etaSeconds = 0;
                            }
                            document.getElementById('eta').innerText = formatTime(etaSeconds);
                        }
                    }
                }, 15 * 60 * 1000); // 15 minutes in milliseconds

                // Fetch and set the current processing status
                async function getCurrentProcessingStatus() {
                    try {
                        const response = await fetch('/gemini-response-times');
                        if (!response.ok) throw new Error('Network response was not ok');
                        const data = await response.json();
                        if (data.response_times.length === 0) return 'None';
                        const latest = data.response_times[0];
                        return latest.course_code + ' - ' + latest.assignment_title;
                    } catch (error) {
                        console.error('Error fetching current processing status:', error);
                        return 'Error';
                    }
                }

                async function updateCurrentStatus() {
                    const currentStatus = await getCurrentProcessingStatus();
                    document.getElementById('current-status').innerText = currentStatus || 'None';
                }

                async function updateDashboard() {
                    await initializeDashboard();
                    await updateCurrentStatus();
                }

                updateDashboard();
                setInterval(updateCurrentStatus, 5000); // Update current status every 5 seconds
            </script>
        </body>
        </html>
    `);
});


app.get('/total-courses', (req, res) => {
    res.json({ total_courses: totalCoursesFromJSON });
});

app.listen(PORT, () => {
    logger.info(`API Server is running on port ${PORT}`);
});
