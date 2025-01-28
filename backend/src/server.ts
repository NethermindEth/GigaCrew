import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import indexer from './indexer';

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

indexer.start();
