import express from 'express';
import pkg from 'pg';
const { Pool, Client } = pkg;
import { logger } from './logger.js';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import redisClient from './redisClient.js'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());

const allowedOrigins = [
    'https://nptel-quiz-one.vercel.app/',
    'https://examcooker.in',
    'https://nptelprep.in'
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

import { apiKeyMiddleware } from './middleware/apiKeyMiddleware.js';

app.use(apiKeyMiddleware);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                course_code VARCHAR(50) UNIQUE NOT NULL,
                course_name VARCHAR(255) NOT NULL,
                request_count INTEGER DEFAULT 0,
                video_count INTEGER DEFAULT 0,
                transcript_count INTEGER DEFAULT 0
            );
        `);
        
        await client.query('CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(course_code)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_questions_assignment_id ON questions(assignment_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_options_question_id ON options(question_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_materials_course_id ON study_materials(course_id)');

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
        await client.query(`
            CREATE TABLE IF NOT EXISTS reported_questions (
              id             SERIAL         PRIMARY KEY,
              question_text  TEXT           NOT NULL,
              course_code    VARCHAR(50)    NOT NULL
                                REFERENCES courses(course_code)
                                ON DELETE CASCADE,
              reason         TEXT           NOT NULL,
              reported_by    VARCHAR(255)   NOT NULL,
              reported_at    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT uq_report UNIQUE (question_text, course_code, reported_by)
            );
          `);
          
        await client.query('COMMIT');
        logger.info('Database tables and indexes initialized successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`Error initializing database: ${error.message}`);
        process.exit(1);
    } finally {
        client.release();
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coursesFilePath = path.join(__dirname, 'public', 'courses.json');
let totalCoursesFromJSON = 0;

const loadCoursesJSON = async () => {
    try {
        const coursesContent = await fs.promises.readFile(coursesFilePath, 'utf-8');
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
};

loadCoursesJSON();

app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPTELPrep API</title>
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
          .cta {
            margin: 10px 0 20px;
            font-size: 1em;
            color: #f9ca24;
          }
          .cta a {
            color: #1e90ff;
            text-decoration: none;
          }
          .cta a:hover {
            color: #ff4757;
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
        <h1>NPTELPrep API</h1>
        <h2>Server is running</h2>
        <div class="cta">
          Get your free NPTELPrep API key at 
          <a href="https://dashboard.nptelprep.in" target="_blank">dashboard.nptelprep.in</a>
        </div>
        <ul class="route-list">
          <li class="route-item"><a href="/courses">/courses</a> - List all courses</li>
          <li class="route-item"><a href="/courses/:courseCode">/courses/:courseCode</a> - Fetch specific course details</li>
          <li class="route-item"><a href="/counts">/counts</a> - Get counts of courses, assignments, questions, options</li>
        </ul>
        <div class="footer">
          Made with ♥ for public usage - <a href="https://github.com/theg1239/nptel-api" target="_blank">GitHub</a>
        </div>
      </body>
      </html>
    `);
  });  

app.get('/courses', async (req, res) => {
    try {
        const cacheKey = 'courses_all';
        const cachedCourses = await redisClient.get(cacheKey);

        if (cachedCourses) {
            logger.info('Serving /courses from Redis cache.');
            return res.json(JSON.parse(cachedCourses));
        }

        const query = `
            SELECT 
                c.course_code, 
                c.course_name, 
                COUNT(q.id) AS question_count,
                ARRAY_AGG(DISTINCT a.week_number) AS weeks,
                c.request_count,
                c.video_count,
                c.transcript_count
            FROM courses c
            LEFT JOIN assignments a ON c.id = a.course_id
            LEFT JOIN questions q ON a.id = q.assignment_id
            GROUP BY c.course_code, c.course_name, c.request_count, c.video_count, c.transcript_count
            ORDER BY c.course_code;
        `;
        const { rows } = await pool.query(query);
        const formattedCourses = rows.map(row => ({
            course_code: row.course_code,
            course_name: row.course_name,
            question_count: parseInt(row.question_count, 10),
            weeks: row.weeks ? row.weeks.sort((a, b) => a - b) : [],
            request_count: parseInt(row.request_count, 10),
            video_count: parseInt(row.video_count, 10),
            transcript_count: parseInt(row.transcript_count, 10)
        }));

        await redisClient.setEx(cacheKey, 300, JSON.stringify({ courses: formattedCourses }));
        logger.info('Caching /courses data in Redis.');

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
    const cacheKey = `course_${courseCode}`;
    
    try {
        const updateCountPromise = pool.query(`
            UPDATE courses
            SET request_count = request_count + 1
            WHERE course_code = $1
            RETURNING id
        `, [courseCode]);
        
        const cachedCoursePromise = redisClient.get(cacheKey);
        
        const [updateResult, cachedCourse] = await Promise.all([
            updateCountPromise,
            cachedCoursePromise
        ]);
        
        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found.' });
        }
        
        if (cachedCourse) {
            logger.info(`Serving /courses/${courseCode} from Redis cache.`);
            return res.json(JSON.parse(cachedCourse));
        }

        const client = await pool.connect();
        try {
            await client.query('SET statement_timeout = 10000');
            
            const query = `
                WITH course_data AS (
                    SELECT id, course_code, course_name, request_count, video_count, transcript_count
                    FROM courses
                    WHERE course_code = $1
                ),
                assignments_with_questions AS (
                    SELECT 
                        a.id as assignment_id,
                        a.week_number,
                        a.assignment_title,
                        a.file_path,
                        json_agg(
                            json_build_object(
                                'question_number', q.question_number,
                                'question_text', q.question_text,
                                'correct_option', q.correct_option,
                                'content_type', q.content_type,
                                'options', (
                                    SELECT json_agg(
                                        json_build_object(
                                            'option_number', o.option_number,
                                            'option_text', o.option_text
                                        )
                                    )
                                    FROM options o
                                    WHERE o.question_id = q.id
                                )
                            )
                        ) as questions
                    FROM course_data cd
                    JOIN assignments a ON a.course_id = cd.id
                    LEFT JOIN questions q ON q.assignment_id = a.id
                    GROUP BY a.id, a.week_number, a.assignment_title, a.file_path
                ),
                materials_data AS (
                    SELECT 
                        json_agg(
                            json_build_object(
                                'id', sm.id,
                                'title', sm.title,
                                'type', sm.type,
                                'weekNumber', sm.week_number,
                                'description', sm.description,
                                'content', sm.content,
                                'url', sm.url,
                                'mimetype', sm.mimetype,
                                'languages', (
                                    SELECT COALESCE(json_agg(
                                        json_build_object(
                                            'language', ml.language,
                                            'url', ml.url
                                        )
                                    ), '[]'::json)
                                    FROM material_languages ml
                                    WHERE ml.material_id = sm.id
                                )
                            )
                        ) as materials
                    FROM course_data cd
                    LEFT JOIN study_materials sm ON sm.course_id = cd.id
                )
                SELECT 
                    cd.*,
                    (SELECT json_agg(row_to_json(a))
                     FROM assignments_with_questions a) as assignments,
                    (SELECT materials FROM materials_data) as materials
                FROM course_data cd;
            `;

            const result = await client.query(query, [courseCode]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Course not found.' });
            }

            const courseData = result.rows[0];
            const formattedData = {
                course_code: courseData.course_code,
                course_name: courseData.course_name,
                assignments: courseData.assignments || [],
                materials: courseData.materials || [],
                video_count: courseData.video_count,
                transcript_count: courseData.transcript_count
            };

            const requestCountResult = await client.query(
                'SELECT request_count FROM courses WHERE course_code = $1',
                [courseCode]
            );
            
            if (requestCountResult.rows.length > 0 && requestCountResult.rows[0].request_count > 20) {
                await redisClient.setEx(cacheKey, 600, JSON.stringify(formattedData));
                logger.info(`Caching /courses/${courseCode} data in Redis.`);
            }

            res.json(formattedData);

        } catch (error) {
            logger.error(`Error fetching course data for ${courseCode}: ${error.message}`);
            
            const staleCache = await redisClient.get(cacheKey);
            if (staleCache) {
                logger.info(`Serving stale cache for ${courseCode} due to timeout`);
                return res.json(JSON.parse(staleCache));
            }
            
            res.status(500).json({ 
                message: 'An error occurred while fetching course data.',
                error: error.message 
            });
        } finally {
            await client.query('RESET statement_timeout');
            client.release();
        }
    } catch (error) {
        logger.error(`Error in /courses/:courseCode: ${error.message}`);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

app.get('/counts', async (req, res) => {
    const cacheKey = 'counts_data';
    const cacheExpiration = 1; 

    try {
        const cachedCounts = await redisClient.get(cacheKey);

        if (cachedCounts) {
            logger.info('Serving /counts from Redis cache.');
            return res.json(JSON.parse(cachedCounts));
        }

        const query = `
            SELECT 
                (SELECT COUNT(*) FROM courses) AS processed_courses,
                (SELECT COUNT(*) FROM assignments) AS total_assignments,
                (SELECT COUNT(*) FROM questions) AS total_questions,
                (SELECT COUNT(*) FROM options) AS total_options,
                (SELECT COUNT(*) FROM study_materials) AS total_study_materials;
        `;
        const { rows } = await pool.query(query);
        if (rows.length === 0) {
            throw new Error('No data returned from counts query.');
        }
        
        const counts = rows[0];
        const processed_courses = parseInt(counts.processed_courses, 10);
        const total_assignments = parseInt(counts.total_assignments, 10);
        const total_questions = parseInt(counts.total_questions, 10);
        const total_options = parseInt(counts.total_options, 10);
        const total_study_materials = parseInt(counts.total_study_materials, 10);

        const countsData = {
            total_courses_from_json: totalCoursesFromJSON,
            processed_courses,
            total_assignments,
            total_questions,
            total_options,
            total_study_materials
        };

        await redisClient.setEx(cacheKey, cacheExpiration, JSON.stringify(countsData));
        logger.info('Caching /counts data in Redis.');

        res.json(countsData);
    } catch (error) {
        logger.error(`Error fetching counts: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching counts.' });
    }
});

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

const verifyEmail = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Authorization header is missing' });
    }

    const email = authHeader;

    req.userEmail = email;
    next();
};

app.post('/report-question', verifyEmail, async (req, res) => {
    const { question_text, reason, course_code } = req.body;
    const reported_by = req.userEmail || 'anonymous';
  
    if (!question_text || !reason || !course_code) {
      return res
        .status(400)
        .json({ message: 'Missing required fields: question_text, reason, and course_code.' });
    }
    if (typeof question_text !== 'string' || !question_text.trim()) {
      return res
        .status(400)
        .json({ message: 'Invalid question_text. Must be a non-empty string.' });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return res
        .status(400)
        .json({ message: 'Invalid reason. Must be a non-empty string.' });
    }
    if (typeof course_code !== 'string' || !course_code.trim()) {
      return res
        .status(400)
        .json({ message: 'Invalid course_code. Must be a non-empty string.' });
    }
  
    const client = await pool.connect();
    try {
      const insertResult = await client.query(
        `INSERT INTO reported_questions
           (question_text, course_code, reason, reported_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, question_text, course_code, reason, reported_by, reported_at;`,
        [
          question_text.trim(),
          course_code.trim(),
          reason.trim(),
          reported_by
        ]
      );
  
      return res.status(201).json({
        message: 'Report submitted successfully.',
        report: insertResult.rows[0],
      });
  
    } catch (error) {
      if (error.code === '23505') {
        return res
          .status(409)
          .json({ message: 'You have already reported this question for this course.' });
      }
  
      logger.error(`Error reporting question: ${error.message}`);
      return res
        .status(500)
        .json({ message: 'An error occurred while submitting the report.' });
  
    } finally {
      client.release();
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
                let avgResponseTime = 15000; 
                let etaSeconds = 0;

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
                    if (responseTimes.length === 0) return 15000; 
                    const total = responseTimes.reduce((acc, curr) => acc + parseInt(curr.response_time_ms, 10), 0);
                    const avg = total / responseTimes.length;
                    return isFinite(avg) && avg > 0 ? avg : 15000;
                }

                function formatTime(seconds) {
                    if (seconds <= 0) return 'Completed';
                    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
                    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
                    const secs = String(seconds % 60).padStart(2, '0');
                    return \`\${hours}:\${minutes}:\${secs}\`;
                }

                function updateCountsUI(counts) {
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
                }

                function updateETA(totalCourses, processedCourses) {
                    const remainingCourses = totalCourses - processedCourses;
                    const etaMs = remainingCourses * avgResponseTime;
                    etaSeconds = Math.floor(etaMs / 1000);

                    if (etaSeconds < 0 || !isFinite(etaSeconds)) {
                        etaSeconds = 0;
                    }

                    document.getElementById('eta').innerText = formatTime(etaSeconds);
                }

                async function initializeDashboard() {
                    const counts = await fetchCounts();
                    if (counts) {
                        updateCountsUI(counts);
                        const responseTimes = await fetchGeminiResponseTimes();
                        avgResponseTime = calculateAverageResponseTime(responseTimes);
                        updateETA(counts.total_courses_from_json, counts.processed_courses);
                    } else {
                        document.getElementById('eta').innerText = 'Unavailable';
                        document.getElementById('current-status').innerText = 'Unavailable';
                    }
                }

                setInterval(() => {
                    if (etaSeconds > 0) {
                        etaSeconds--;
                        document.getElementById('eta').innerText = formatTime(etaSeconds);
                    } else {
                        document.getElementById('eta').innerText = 'Completed';
                    }
                }, 1000);

                setInterval(async () => {
                    const responseTimes = await fetchGeminiResponseTimes();
                    const newAvg = calculateAverageResponseTime(responseTimes);
                    if (newAvg !== avgResponseTime) {
                        avgResponseTime = newAvg;
                        const counts = await fetchCounts();
                        if (counts) {
                            updateETA(counts.total_courses_from_json, counts.processed_courses);
                        }
                    }
                }, 15 * 60 * 1000); 

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

                async function updateCounts() {
                    const counts = await fetchCounts();
                    if (counts) {
                        updateCountsUI(counts);
                        updateETA(counts.total_courses_from_json, counts.processed_courses);
                    }
                }

                async function initializeDashboardPage() {
                    await initializeDashboard();
                    await updateCurrentStatus();
                }

                initializeDashboardPage();

                setInterval(updateCounts, 5000); 
                setInterval(updateCurrentStatus, 5000); 
            </script>
        </body>
        </html>
    `);
});

app.get('/total-courses', (req, res) => {
    res.json({ total_courses: totalCoursesFromJSON });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'up',
        timestamp: new Date().toISOString(),
        version: process.env.VERSION || '1.0.0'
    });
});

app.get('/counts', async (req, res) => {
    try {
        const cacheKey = 'api_counts';
        const cachedCounts = await redisClient.get(cacheKey);

        if (cachedCounts) {
            logger.info('Serving /counts from Redis cache.');
            return res.json(JSON.parse(cachedCounts));
        }

        const client = await pool.connect();
        try {
            const coursesQuery = await client.query('SELECT COUNT(*) as count FROM courses');
            const assignmentsQuery = await client.query('SELECT COUNT(*) as count FROM assignments');
            const questionsQuery = await client.query('SELECT COUNT(*) as count FROM questions');
            const optionsQuery = await client.query('SELECT COUNT(*) as count FROM options');
            
            const progressQuery = await client.query('SELECT * FROM scraping_progress ORDER BY id DESC LIMIT 1');
            
            const counts = {
                total_courses: parseInt(coursesQuery.rows[0].count, 10),
                total_assignments: parseInt(assignmentsQuery.rows[0].count, 10),
                total_questions: parseInt(questionsQuery.rows[0].count, 10),
                total_options: parseInt(optionsQuery.rows[0].count, 10),
                total_courses_from_json: totalCoursesFromJSON,
                progress: progressQuery.rows.length > 0 ? progressQuery.rows[0] : null
            };
            
            await redisClient.setEx(cacheKey, 300, JSON.stringify(counts));
            logger.info('Caching /counts data in Redis.');
            
            res.json(counts);
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error(`Error fetching counts: ${error.message}`);
        res.status(500).json({ message: 'An error occurred while fetching counts.' });
    }
});

app.listen(PORT, () => {
    logger.info(`API Server is running on port ${PORT}`);
});