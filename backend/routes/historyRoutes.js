const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all history routes
router.use(authMiddleware);

router.post('/', historyController.addHistory);
router.get('/', historyController.getHistory);

module.exports = router;
