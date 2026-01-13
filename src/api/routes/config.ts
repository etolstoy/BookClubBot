import { Router } from "express";
import { config } from "../../lib/config.js";

const router = Router();

// GET /api/config - Get public configuration
router.get("/", async (req, res) => {
  try {
    res.json({
      adminUserIds: config.adminUserIds.map(id => id.toString()),
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

export default router;
