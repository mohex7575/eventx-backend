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

    // إحصائيات الفعاليات
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
        $project: {
          title: 1,
          ticketCount: { $size: '$tickets' },
          revenue: { $sum: '$tickets.price' },
          date: 1
        }
      },
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
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Get event analytics
// @route   GET /api/analytics/events/:id
// @access  Private/Admin
router.get('/events/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const tickets = await Ticket.find({ event: req.params.id })
      .populate('user', 'name email');

    const revenue = tickets.reduce((sum, ticket) => sum + ticket.price, 0);
    const attendanceRate = (tickets.length / event.totalSeats) * 100;

    // تحليل demographic (افتراضي - يمكن تخصيصه)
    const demographics = {
      ageGroups: { '18-25': 35, '26-35': 45, '36-45': 15, '46+': 5 },
      genders: { male: 60, female: 40 },
      locations: { 'Riyadh': 40, 'Jeddah': 30, 'Dammam': 20, 'Other': 10 }
    };

    res.json({
      event: {
        title: event.title,
        date: event.date,
        location: event.location
      },
      stats: {
        totalTickets: tickets.length,
        revenue,
        attendanceRate: Math.round(attendanceRate),
        availableSeats: event.availableSeats
      },
      demographics,
      tickets
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Export tickets report
// @route   GET /api/analytics/export/:eventId?
// @access  Private/Admin
router.get('/export/:eventId?', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const { eventId } = req.params;
    let query = {};
    
    if (eventId) query.event = eventId;

    const tickets = await Ticket.find(query)
      .populate('event', 'title date')
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    // تحويل البيانات إلى CSV
    const csvData = tickets.map(ticket => ({
      'Ticket ID': ticket._id,
      'Event': ticket.event.title,
      'Date': new Date(ticket.event.date).toLocaleDateString(),
      'Attendee': ticket.user.name,
      'Email': ticket.user.email,
      'Seat': ticket.seatNumber,
      'Price': ticket.price,
      'Status': ticket.status,
      'Booking Date': new Date(ticket.bookingDate).toLocaleDateString()
    }));

    res.json(csvData);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

module.exports = router;
