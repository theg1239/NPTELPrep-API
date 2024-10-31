// server.js or app.js

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import { logger } from './logger.js'; 
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());

const corsOptions = {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true, 
};

app.use(cors(corsOptions));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, 
});

const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        logger.info('Initializing database tables...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                course_code VARCHAR(50) UNIQUE NOT NULL,
                course_name VARCHAR(255) NOT NULL
            );
        `);
        logger.info('Ensured courses table exists.');

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
        logger.info('Ensured assignments table exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
                question_number INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                correct_option TEXT NOT NULL, -- Stored as comma-separated option letters
                UNIQUE(assignment_id, question_number)
            );
        `);
        logger.info('Ensured questions table exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS options (
                id SERIAL PRIMARY KEY,
                question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
                option_number CHAR(1) NOT NULL, -- e.g., 'A', 'B', 'C', 'D'
                option_text TEXT NOT NULL,
                UNIQUE(question_id, option_number)
            );
        `);
        logger.info('Ensured options table exists.');

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

// Root Route
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
                    font-family: 'Press Start 2P', sans-serif; /* Game-over font style */
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
            </ul>
            <div class="footer">Made with ♥</div>
        </body>
        </html>
    `);
});

// Enhanced /courses Endpoint
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

// Detailed Course Endpoint
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

// Removed /view-questions Endpoint
// If you have other related endpoints or functionalities relying on /view-questions, ensure to update them accordingly.

// Start Server
app.listen(PORT, () => {
    logger.info(`API Server is running on port ${PORT}`);
});
