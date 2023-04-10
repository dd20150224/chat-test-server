const { config } = require('dotenv');
config();

const mongoose = require('mongoose');
mongoose.connect(process.env.CONNECTION_STR);