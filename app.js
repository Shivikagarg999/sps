// Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const User = require('./models/User'); 
const Job = require('./models/Job'); 
require('dotenv').config();

const app = express();

// Middleware to parse incoming request bodies
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use(express.json());
app.use(session({
    secret: 'your_secret_key', 
    resave: false,
    saveUninitialized: true,
}));
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1); 
    }
};
connectDB();
app.set('view engine', 'ejs');
app.set('views', './views');
app.get('/', (req, res) => {
    res.render('index');
});
app.post('/login', async (req, res) => {
    const { role, username, email, password } = req.body;
            
    try {
      // Find the user by username and role
      const user = await User.findOne({ username, role });
  
      // Check if user exists and password matches
      if (!user || user.password !== password) {
        return res.status(401).send('Invalid username or password.');
      }
  
      // Set session userId after successful login
      req.session.userId = user._id;
  
      res.cookie('authToken', 'secure-value', {
        httpOnly: true,
        secure: false, 
        maxAge: 1000 * 60 * 60 * 24,
    });

    res.redirect(`/${role}/dashboard`);
    } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).send('Internal server error.');
    }
  });
app.get('/teacher/dashboard', async (req, res) => {
    try {
        const jobs = await Job.find(); // Fetch jobs from the database
        res.render('teacherDashboard', { jobs }); // Pass jobs to the template
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/crc/dashboard', isAuthenticated, async (req, res) => {
  try {
      const jobs = await Job.find(); // Fetch all job postings
      res.render('crcDashboard', { jobs: jobs || [] }); // Pass jobs to the view, default to empty array
  } catch (error) {
      console.error('Error fetching jobs:', error);
      res.status(500).send('Internal server error.');
  }
});
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password, email, role, rollNumber } = req.body;

    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Username already exists.' });
        }

        // Create a new user object
        const newUser = new User({
            username,
            password,
            email,
            role,
        });

        // Add role-specific fields
        if (role === "student" && rollNumber) {
            newUser.rollNumber = rollNumber;
        }

        await newUser.save();
        console.log(newUser)
        res.redirect('/'); // Redirect after successful registration
    } catch (err) {
        console.log('Error during registration:', err);
        res.render('register', { error: 'An error occurred during registration.' });
    }
});

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next(); 
    }
    res.redirect('/'); 
}
app.get('/student/dashboard', isAuthenticated, async (req, res) => {
    try {
        const jobs = await Job.find(); 
        const student = await User.findById(req.session.userId); 
        if (!student) {
            return res.status(404).send('Student not found.');
        }


        const appliedJobIds = student.appliedJobs.map(job => job.toString());

   
        res.render('studentDashboard', {
            jobs,                     
            appliedJobs: appliedJobIds,
            user: student   
        });
    } catch (error) {
        console.error('Error fetching student dashboard data:', error);
        res.status(500).send('Internal server error.');
    }
});
app.post('/crc/post-job', isAuthenticated, async (req, res) => {
    const { title, description, company, applyLink } = req.body;

    const newJob = new Job({
        title,
        description,
        company,
        applicants: [] 
    });

    try {
        await newJob.save();
        res.redirect('/crc/dashboard')
    } catch (err) {
        console.error('Error posting job:', err);
        res.status(500).send('Error posting job.');
    }
});
app.post('/crc/delete-job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;
        const deletedJob = await Job.findByIdAndDelete(jobId);

        if (!deletedJob) {
            return res.status(404).send('Job not found');
        }

        res.redirect('/crc/dashboard'); // Redirect to the dashboard after deletion
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while deleting the job');
    }
});
app.get('/logout', (req, res) => {
    // Clear the authToken cookie
    res.clearCookie('authToken');

    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Unable to log out. Please try again.');
        }

        // Redirect to the dashboard
        res.redirect('/crc/dashboard');
    });
});

app.post('/apply/:jobId', async (req, res) => {
    try {
        const { userId } = req.body; // The user's ID from the request
        const { jobId } = req.params; // The job ID from the route parameter

        // Find the user and job
        const user = await User.findById(userId);
        const job = await Job.findById(jobId);

        if (!user || !job) {
            return res.status(404).json({ message: 'User or Job not found' });
        }

        // Check if the user has already applied to the job
        if (user.appliedJobs.includes(jobId)) {
                  return res.status(400).json({ message: 'Already applied to this job' });
        }

        // Add the job to the user's appliedJobs array
        user.appliedJobs.push(jobId);

        // Add the user to the job's applicants array
        job.applicants.push(userId);

        // Save both documents
        await user.save();
        await job.save();

        res.status(200).json({ message: 'Application successful!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
app.listen(8000, () => {
    console.log('Server started on port 8000');
});      