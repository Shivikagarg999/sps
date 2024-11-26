// Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const User = require('./models/User'); 
const Job = require('./models/Job'); 
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
      return res.status(500).send('Internal server errorz.');
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
        const student = await User.findById(req.session.userId).populate('appliedJobs'); // Populate applied jobs
        if (!student) {
            return res.status(404).send('Student not found.');
        }

        const jobs = await Job.find(); // Get all available jobs for students to apply to
        const appliedJobs = student.appliedJobs; // Get the full job objects from the populated field

        res.render('studentDashboard', {
            jobs,                      // Available jobs
            appliedJobs,               // Applied job objects with all job details
            user: student              // Student details
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

        // Check if user or job is not found
        if (!user || !job) {
            return res.status(404).json({ message: 'User or Job not found' });
        }

        // Ensure appliedJobs and applicants fields exist
        if (!user.appliedJobs) user.appliedJobs = [];
        if (!job.applicants) job.applicants = [];

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
app.get('/crc/view-applicants/:jobId', isAuthenticated, async (req, res) => {
    try {
        const { jobId } = req.params;

        // Find the job with its applicants and shortlisted candidates
        const job = await Job.findById(jobId)
            .populate('applicants')  // Populate applicants
            .populate('shortlisted'); // Populate shortlisted candidates

        if (!job) {
            return res.status(404).send('Job not found.');
        }

        res.render('viewApplicants', { job });
    } catch (error) {
        console.error('Error fetching applicants:', error);
        res.status(500).send('Internal server error.');
    }
});

app.post('/crc/delete-applicant/:jobId/:applicantId', async (req, res) => {
    const { jobId, applicantId } = req.params;
    try {
        const job = await Job.findById(jobId);
        if (!job) return res.status(404).send('Job not found');
        
        // Remove applicant from job
        job.applicants = job.applicants.filter(applicant => applicant.toString() !== applicantId);
        await job.save();
        
        res.render('viewApplicants'); // Redirect back to the current page
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting applicant');
    }
});
app.post('/crc/shortlist/:jobId/:applicantId', async (req, res) => {
    const { jobId, applicantId } = req.params;

    try {
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).send('Job not found');
        }

        const isApplicant = job.applicants.includes(applicantId);
        if (!isApplicant) {
            return res.status(400).send('Applicant not found in applicants list');
        }

        if (job.shortlisted.includes(applicantId)) {
            return res.status(400).send('Applicant is already shortlisted');
        }

        job.applicants = job.applicants.filter(applicant => applicant.toString() !== applicantId);
        job.shortlisted.push(applicantId);  // Add to shortlisted

        await job.save();

        res.redirect(`/crc/view-applicants/${jobId}`);
    } catch (error) {
        console.error('Error shortlisting applicant:', error);
        res.status(500).send('Internal server error');
    }
});

const multer = require('multer');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', 'resumes');
        // Ensure the directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir); // Save the file in the "uploads/resumes" folder
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // Use a unique filename
    }
});

const upload = multer({ storage });
app.get('/uploadget', async (req, res) => {
    try {
        const userId = req.session.userId;  // Get the user ID from session
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).send('User not found.');
        }

        // Pass the user object to the 'uploadget' view
        res.render('uploadget', { user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal server error.');
    }
});

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        const userId = req.session.userId; // Assuming session stores logged-in user ID
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).send('User not found.');
        }

        user.resume = `/uploads/resumes/${req.file.filename}`;
        await user.save();

        res.redirect('/student/dashboard'); // Redirect back to student dashboard
    } catch (error) {
        console.error('Error uploading resume:', error);
        res.status(500).send('Error uploading resume.');
    }
});

app.listen(8000, () => {
    console.log('Server started on port 8000');
});      