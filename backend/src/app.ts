import express, { Express } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import routes from './routes';

const app: Express = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI!)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

export default app; 