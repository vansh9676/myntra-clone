const express = require("express");
const mongoose = require("mongoose");
const RecentlyViewed = require("../models/RecentlyViewed");

const router = express.Router();

const MAX_ITEMS = 20;

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const normalizeSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") {
    return undefined;
  }

  const normalized = {};

  if (typeof snapshot.name === "string") {
    normalized.name = snapshot.name;
  }
  if (typeof snapshot.image === "string") {
    normalized.image = snapshot.image;
  }
  if (typeof snapshot.price === "number" && Number.isFinite(snapshot.price)) {
    normalized.price = snapshot.price;
  }

  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeIncomingItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  const deduped = new Map();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const { productId, viewedAt, productSnapshot } = item;
    const parsedTimestamp = Number(viewedAt);

    if (
      typeof productId !== "string" ||
      !isValidObjectId(productId) ||
      !Number.isFinite(parsedTimestamp)
    ) {
      continue;
    }

    const snapshot = normalizeSnapshot(productSnapshot);
    const existing = deduped.get(productId);

    if (!existing || parsedTimestamp > existing.viewedAt) {
      deduped.set(productId, {
        productId,
        viewedAt: parsedTimestamp,
        productSnapshot: snapshot,
      });
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_ITEMS);
};

const trimUserHistory = async (userId) => {
  const history = await RecentlyViewed.find({ userId })
    .sort({ viewedAt: -1, _id: -1 })
    .select("_id")
    .lean();

  if (history.length <= MAX_ITEMS) {
    return;
  }

  const toDeleteIds = history.slice(MAX_ITEMS).map((item) => item._id);
  await RecentlyViewed.deleteMany({ _id: { $in: toDeleteIds } });
};

const upsertRecentView = async (userId, item) => {
  const existing = await RecentlyViewed.findOne({
    userId,
    productId: item.productId,
  });

  if (!existing) {
    await RecentlyViewed.create({
      userId,
      productId: item.productId,
      viewedAt: item.viewedAt,
      productSnapshot: item.productSnapshot,
    });
    return;
  }

  const hasNewerTimestamp = item.viewedAt > existing.viewedAt;
  const hasMissingSnapshot = !existing.productSnapshot && item.productSnapshot;

  if (!hasNewerTimestamp && !hasMissingSnapshot) {
    return;
  }

  if (hasNewerTimestamp) {
    existing.viewedAt = item.viewedAt;
    if (item.productSnapshot) {
      existing.productSnapshot = item.productSnapshot;
    }
  } else if (hasMissingSnapshot) {
    existing.productSnapshot = item.productSnapshot;
  }

  await existing.save();
};

const getHistory = async (userId) => {
  const rows = await RecentlyViewed.find({ userId })
    .sort({ viewedAt: -1, _id: -1 })
    .limit(MAX_ITEMS)
    .lean();

  return rows.map((row) => ({
    productId: row.productId.toString(),
    viewedAt: row.viewedAt,
    productSnapshot: row.productSnapshot,
  }));
};

router.get("/:userid", async (req, res) => {
  const { userid } = req.params;
  if (!isValidObjectId(userid)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const items = await getHistory(userid);
    return res.status(200).json(items);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

router.post("/track", async (req, res) => {
  const { userId, productId, viewedAt, productSnapshot } = req.body || {};
  const parsedTimestamp = Number(viewedAt ?? Date.now());

  if (
    !isValidObjectId(userId) ||
    !isValidObjectId(productId) ||
    !Number.isFinite(parsedTimestamp)
  ) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  try {
    await upsertRecentView(userId, {
      productId: toObjectId(productId),
      viewedAt: parsedTimestamp,
      productSnapshot: normalizeSnapshot(productSnapshot),
    });

    await trimUserHistory(userId);
    const items = await getHistory(userId);
    return res.status(200).json(items);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

router.post("/sync/:userid", async (req, res) => {
  const { userid } = req.params;
  if (!isValidObjectId(userid)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const incomingItems = normalizeIncomingItems(req.body?.items);

  try {
    for (const item of incomingItems) {
      await upsertRecentView(userid, {
        productId: toObjectId(item.productId),
        viewedAt: item.viewedAt,
        productSnapshot: item.productSnapshot,
      });
    }

    await trimUserHistory(userid);
    const items = await getHistory(userid);
    return res.status(200).json(items);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

module.exports = router;
