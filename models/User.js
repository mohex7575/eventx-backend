const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'], // يحدد أن الدور يمكن أن يكون 'user' أو 'admin' فقط
    default: 'user', // القيمة الافتراضية هي مستخدم عادي
  },
}, { timestamps: true }); // timestamps تضيف created_at و updated_at تلقائياً

// دالة لتشفير كلمة المرور قبل حفظ المستخدم
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// دالة لمقارنة كلمة المرور المدخلة مع المشفرة في DB
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);