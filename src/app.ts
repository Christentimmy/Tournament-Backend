import cors from 'cors';
import tournamentRoutes from './routes/tournament_routes';
import { errorHandler } from './middlewares/error';
import express from 'express';
import { connectToDatabase } from './config/database';

const port = process.env.PORT || 3000;

const app = express();


app.use(cors());
app.use(express.json());



app.use('/api/tournaments', tournamentRoutes);

app.use(errorHandler); 

connectToDatabase();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
