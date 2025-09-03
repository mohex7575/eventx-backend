const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const router = express.Router();

// @desc    Get dashboard statistics
// @route   GET /api/analytics/dashboard
// @access  Private/Admin
router.get('/dashboard', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    // الإحصائيات الأساسية
    const totalEvents = await Event.countDocuments();
    const totalTickets = await Ticket.countDocuments();
    const totalRevenueAgg = await Ticket.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    const totalUsers = await User.countDocuments();
    const activeEvents = await Event.countDocuments({ date: { $gte: new Date() } });

    const recentTickets = await Ticket.find()
      .populate('event', 'title')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);

    // الإحصائيات الشهرية
    const monthlyRevenue = await Ticket.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' },
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$price" },
          tickets: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // إحصائيات الفعاليات - تعديل لتجنب خطأ 500
    const eventStats = await Event.aggregate([
      {
        $lookup: {
          from: 'tickets',
          localField: '_id',
          foreignField: 'event',
          as: 'tickets'
        }
      },
      {
        $addFields: {
          ticketCount: { $size: '$tickets' },
          revenue: { 
            $sum: {
              $map: {
                input: '$tickets',
                as: 't',
                in: { $ifNull: ['$$t.price', 0] }
              }
            }
          }
        }
      },
      { $project: { title: 1, ticketCount: 1, revenue: 1, date: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      overview: {
        totalEvents,
        totalTickets,
        totalRevenue,
        totalUsers,
        activeEvents
      },
      monthlyRevenue,
      topEvents: eventStats,
      recentTickets
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

module.exports = router;
