const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const User = require('./models/User'); 
const Job = require('./models/Job'); 
require('dotenv').config();  
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());
app.use(session({
    secret: 'your-secret-key',  
    resave: false,              // Prevent session from being saved when unmodified
          saveUninitialized: true,    // Save session even if not modified
    cookie: {
      httpOnly: true,           // Ensures the cookie is sent only via HTTP(S)
      maxAge: 1000 * 60 * 60 * 24, // 1 day cookie expiration
    }
  }));
  app.use('/uploads', express.static(path.join('/data', 'uploads')));
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
// app.get('/teacher/dashboard', async (req, res) => {
//     try {
//         const jobs = await Job.find(); // Fetch jobs from the database
//         res.render('teacherDashboard', { jobs }); // Pass jobs to the template
//     } catch (error) {
//         console.error("Error fetching jobs:", error);
//         res.status(500).send("Internal Server Error");
//     }
// });
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
    const { username, password, email, role, branch, rollNumber } = req.body;

    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Username already exists.' });
        }

        // Create a new user object
        let newUser = new User({
            username,
            password,
            email,
            role,
            branch, // Include branch for student role
        });

        // Add role-specific fields
        if (role === "student") {
            newUser.rollNumber = rollNumber;  // Assign roll number for student
            newUser.branch = branch;  // Assign branch for student
        } else if (role === 'parent') {
            // For parent, we just store the roll number and branch of the student
            newUser.rollNumber = rollNumber;  // Student's roll number
            newUser.branch = branch;  // Student's branch
        }

        await newUser.save();  // Save the user to the database
        console.log('Registered User:', newUser);

        res.redirect('/');  // Redirect after successful registration
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
    const { title, description,salary, company, applyLink } = req.body;

    const newJob = new Job({
        title,
        description,
        salary,
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
        res.redirect('/');
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
            .populate('applicants')  
            .populate('shortlisted')
            .populate('interviewed')
            .populate('placed');

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

        // Redirect to the job applicants page with the jobId
        res.redirect(`/crc/view-applicants/${jobId}`);
    } catch (error) {
        console.error('Error shortlisting applicant:', error);
        res.status(500).send('Internal server error');
    }
});
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join('/data', 'uploads', 'resumes');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });
app.post('/upload-resume', upload.single('resume'), async (req, res) => {
    console.log(req.file);  // Log the file object to check if it's coming through
    
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const userId = req.session.userId; 
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).send('User not found.');
        }

        user.resume = `/uploads/resumes/${req.file.filename}`;
        await user.save();

        res.redirect('/student/dashboard'); 
    } catch (error) {
        console.error('Error uploading resume:', error);
        res.status(500).send('Error uploading resume.');
    }
});
app.get('/profile', async (req, res) => {
    try {
        const student = await User.findById(req.session.userId).populate('appliedJobs'); // Populate applied jobs
        if (!student) {
            return res.status(404).send('Student not found.');
        }

        const jobs = await Job.find(); // Get all available jobs for students to apply to
        const appliedJobs = student.appliedJobs; // Get the full job objects from the populated field

        res.render('profile', {
            jobs,                      // Available jobs
            appliedJobs,               // Applied job objects with all job details
            user: student              // Student details
        });
    } catch (error) {
        console.error('Error fetching student dashboard data:', error);
        res.status(500).send('Internal server error.');
    }

  
});
app.get('/appliedjobs', async (req, res) => {
    try {
        // Assuming the user is logged in and their ID is in the session
        const userId = req.session.userId; // Modify as per your session setup
        
        // Fetch the user and their applied jobs from the database
        const user = await User.findById(userId).populate('appliedJobs');
        
        // Render the appliedjobs.ejs page, passing the applied jobs data
        res.render('appliedjobs', {
            appliedJobs: user.appliedJobs, // Assuming appliedJobs is an array of job objects
        });
    } catch (error) {
        console.error('Error fetching applied jobs:', error);
        res.status(500).send('Server error');
    }
});
app.post('/crc/interview/:jobId/:candidateId', async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId).populate('shortlisted interviewed placed');

        if (!job) return res.status(404).send('Job not found');

        const candidateId = req.params.candidateId;

        // Ensure candidate is not already in the interviewed array
        if (!job.interviewed.some(candidate => candidate._id.equals(candidateId))) {
            job.interviewed.push(candidateId);
        }

        // Ensure the candidate is removed from the shortlisted array
        job.shortlisted = job.shortlisted.filter(candidate => !candidate._id.equals(candidateId));

        await job.save();

        // Redirect to the correct applicants page
        res.redirect(`/crc/view-applicants/${job._id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});
app.post('/crc/place/:jobId/:candidateId', async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId).populate('shortlisted interviewed placed');

        if (!job) return res.status(404).send('Job not found');

        const candidateId = req.params.candidateId;

        // Ensure the candidate is only placed if they are already interviewed
        if (!job.interviewed.some(candidate => candidate._id.toString() === candidateId)) {
            return res.status(400).send('Candidate must be interviewed before being placed');
        }

        // Add candidate to placed array if not already there
        if (!job.placed.includes(candidateId)) {
            job.placed.push(candidateId);
        }

        // Remove candidate from the interviewed array
        job.interviewed = job.interviewed.filter(candidate => candidate._id.toString() !== candidateId);

        // Save the updated job document
        await job.save();

        // Redirect to the applicants page for the job
        res.redirect(`/crc/view-applicants/${job._id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});
async function isTeacherAuthenticated(req, res, next) {
    try {
        // Use async/await for Mongoose queries
        const user = await User.findById(req.session.userId);
        
        // Check if the user exists and if the role is teacher
        if (user && user.role === 'teacher') {
            return next(); // Proceed to the next middleware/route
        }
        
        // If not authenticated, redirect to login page
        res.redirect('/');
    } catch (error) {
        console.error('Error during teacher authentication:', error);
        res.status(500).send('Internal Server Error');
    }
}

// Teacher route to view students
app.get('/teacher/dashboard', isTeacherAuthenticated, async (req, res) => {
    try {
        const { branch } = req.query; // Get branch from query string
        let students;
        const jobs = await Job.find(); // Assuming Job is a model for job postings
        // res.render('jobsPage', { jobs });
        if (branch) {
            students = await User.find({ role: 'student', branch }); // Filter by selected branch
        } else {
            students = await User.find({ role: 'student' }); // Show all students if no branch is selected
        }

        const branches = [
            "Computer Science",
            "Information Technology",
            "Electronics and Communication",
            "Mechanical Engineering",
            "Civil Engineering",
            "Electrical Engineering"
        ]; 

        res.render('teacher', { students, branches, selectedBranch: branch });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/analytics', async (req, res) => {
    try {
      const totalStudents = await User.countDocuments({ role: 'student' });
      const studentsApplied = await User.countDocuments({ role: 'student', appliedJobs: { $exists: true, $not: { $size: 0 } } });
  
      const interviewedStudents = await Job.aggregate([
        { $unwind: "$interviewed" },
        { $group: { _id: "$interviewed" } },
        { $count: "totalInterviewed" }
      ]);
      const studentsInterviewed = interviewedStudents[0]?.totalInterviewed || 0;
  
      const placedStudents = await Job.aggregate([
        { $unwind: "$placed" },
        { $group: { _id: "$placed" } },
        { $count: "totalPlaced" }
      ]);
      const studentsPlaced = placedStudents[0]?.totalPlaced || 0;
  
      res.render('analytics', {
        totalStudents,
        studentsApplied,
        studentsInterviewed,
        studentsPlaced,
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  });
  app.get('/jobs', async (req, res) => {
    try {
      const jobs = await Job.find(); // Assuming Job is your model for jobs
      res.render('jobs', { jobs }); // This sends the 'jobs' data to the jobs.ejs file
    } catch (error) {
      console.error(error);
      res.status(500).send('Something went wrong!');
    }
  });
  app.get('/parent/dashboard', async (req, res) => {
    try {
      const { rollNumber, branch } = req.query; // Get roll number and branch from the query
      
      // Check if the roll number and branch are provided
      if (!rollNumber || !branch) {
        return res.status(400).send('Missing roll number or branch');
      }
  
      // Find the parent using the roll number and branch, and ensure the role is 'parent'
      const parent = await User.findOne({ rollNumber, branch, role: 'parent' });
      if (!parent) {
        return res.status(404).send('Parent not found or incorrect roll number/branch');
      }
  
      // Find the corresponding student based on roll number and branch, and ensure the role is 'student'
      const student = await User.findOne({ rollNumber, branch, role: 'student' })
        .populate('appliedJobs');  // Populate the applied jobs to display them
  
      if (!student) {
        return res.status(404).send('Student not found');
      }
  
      // Render the dashboard with the student's application data
      res.render('parent', {
        parentName: parent.username,  // Assuming 'username' for parent name
        studentName: student.username,  // Assuming 'username' for student name
        applications: student.appliedJobs
      });
    } catch (error) {
      console.error(error);
      res.status(500).send('Something went wrong');
    }
  });
  
app.listen(8000, () => {
    console.log('Server started on port 8000');
});      