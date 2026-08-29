const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Loom & Luster API is running',
  });
};

module.exports = { getHealth };
