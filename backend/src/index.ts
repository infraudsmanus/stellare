import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import uploadRoutes from './routes/uploadRoutes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/uploads', uploadRoutes);

app.get('/', (req, res) => {
  res.send('Stellare Backend is running!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export default app;

