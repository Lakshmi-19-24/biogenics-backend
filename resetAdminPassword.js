import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./src/models/user.model.js";

 const MONGO_URI = "mongodb+srv://testuser:Test123456@cluster0.gaw3rbz.mongodb.net/biogenics_sales?retryWrites=true&w=majority&appName=Cluster0";

const resetPassword = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    const result = await User.updateOne(
      { email: "admin@biogenics.com" },
      { $set: { password: hashedPassword } }
    );

    console.log("Password reset successful:", result);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

resetPassword();