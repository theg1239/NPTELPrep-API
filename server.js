// server.js

import express from 'express';
import { Pool } from 'pg';
import { logger } from './logger.js'; // Ensure logger.js is properly set up
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// Initialize PostgreSQL connection pool using connection string
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Ensure DATABASE_URL is set in .env
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Adjust SSL based on environment
});

// Function to initialize database (create tables if they don't exist)
const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        logger.info('Initializing database tables...');

        // Create courses table
        await client.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                course_code VARCHAR(50) UNIQUE NOT NULL,
                course_name VARCHAR(255) NOT NULL
            );
        `);
        logger.info('Ensured courses table exists.');

        // Create assignments table
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

        // Create questions table
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

        // Create options table
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

// Call initializeDatabase on server start
initializeDatabase();

// Express Routes

// Home endpoint
app.get('/', (req, res) => {
    res.send('NPTEL API Server is running.');
});

// List all courses
app.get('/courses', async (req, res) => {
    try {
        const query = `
            SELECT course_code, course_name
            FROM courses
            ORDER BY course_code;
        `;
        const { rows } = await pool.query(query);
        res.json({
            courses: rows
        });
    } catch (error) {
        logger.error(`Error fetching all courses: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching courses.' });
    }
});

// Get specific course details in the desired format
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

        // Initialize the formatted data structure
        const formattedData = {
            title: rows[0].course_name,
            weeks: []
        };

        // Map to keep track of weeks and questions
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

            // Add option to the question
            weekMap[weekKey].questions[questionNumber].options.push(`Option ${row.option_number}: ${row.option_text}`);

            // Add correct answer(s) by mapping option letters to option texts
            const correctOptions = row.correct_option.split(',').map(opt => opt.trim().toUpperCase());
            if (correctOptions.includes(row.option_number.toUpperCase())) {
                weekMap[weekKey].questions[questionNumber].answer.push(`Option ${row.option_number}: ${row.option_text}`);
            }
        });

        // Convert questions from object to array
        formattedData.weeks.forEach(week => {
            week.questions = Object.values(week.questions);
        });

        res.json(formattedData);
    } catch (error) {
        logger.error(`Error fetching course data for ${courseCode}: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching course data.' });
    }
});

// View Questions Summary
app.get('/view-questions', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.course_code, 
                c.course_name, 
                COUNT(q.id) as question_count
            FROM courses c
            LEFT JOIN assignments a ON c.id = a.course_id
            LEFT JOIN questions q ON a.id = q.assignment_id
            GROUP BY c.course_code, c.course_name
            ORDER BY c.course_code;
        `;
        const { rows } = await pool.query(query);
        const coursesWithQuestions = rows.map(row => ({
            course_code: row.course_code,
            course_name: row.course_name,
            question_count: parseInt(row.question_count, 10)
        }));
        res.json({
            courses: coursesWithQuestions
        });
    } catch (error) {
        logger.error(`Error fetching questions per course: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching questions per course.' });
    }
});

// Start the server
app.listen(PORT, () => {
    logger.info(`API Server is running on port ${PORT}`);
});
