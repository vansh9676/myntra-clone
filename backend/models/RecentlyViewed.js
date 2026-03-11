const mongoose = require("mongoose");

const RecentlyViewedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    viewedAt: {
      type: Number,
      required: true,
    },
    productSnapshot: {
      name: { type: String },
      image: { type: String },
      price: { type: Number },
    },
  },
  { timestamps: true }
);

RecentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });
RecentlyViewedSchema.index({ userId: 1, viewedAt: -1 });

module.exports = mongoose.model("RecentlyViewed", RecentlyViewedSchema);
