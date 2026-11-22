const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const teamRoutes = require('./routes/team.routes');
const playerRoutes = require('./routes/player.routes');
const competitionRoutes = require('./routes/competition.routes');
const registrationRoutes = require('./routes/registration.routes');
const lotteryRoutes = require('./routes/lottery.routes');
const judgePanelRoutes = require('./routes/judgePanel.routes');
const scoreRoutes = require('./routes/score.routes');
const scoreSheetRoutes = require('./routes/scoreSheet.routes');
const rankingRoutes = require('./routes/ranking.routes');
const ageGroupRoutes = require('./routes/ageGroup.routes');
const publicRoutes = require('./routes/public.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/judge-panels', judgePanelRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/score-sheets', scoreSheetRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/age-groups', ageGroupRoutes);

// Simplified flow: public landing page + admin console
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Mallakhamb Competition API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Start server
const startServer = async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API available at http://localhost:${PORT}/api`);
  });
};

startServer();
