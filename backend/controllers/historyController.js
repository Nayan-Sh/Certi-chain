const VerificationHistory = require('../models/VerificationHistory');

exports.addHistory = async (req, res) => {
  try {
    const { certificateId, status, metadata } = req.body;
    
    if (!certificateId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const history = new VerificationHistory({
      userId: req.user.id,
      certificateId,
      status,
      metadata
    });

    await history.save();
    res.status(201).json({ message: 'History saved successfully', history });
  } catch (err) {
    console.error('addHistory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const history = await VerificationHistory.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50); // limit to last 50 for performance
      
    res.status(200).json(history);
  } catch (err) {
    console.error('getHistory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
