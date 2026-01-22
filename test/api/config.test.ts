import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import configRouter from "../../src/api/routes/config.js";
import { config } from "../../src/lib/config.js";

describe("GET /api/config", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use("/api/config", configRouter);
  });

  it("should return admin user IDs and bot username", async () => {
    const response = await request(app).get("/api/config");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("adminUserIds");
    expect(response.body).toHaveProperty("botUsername");
    expect(Array.isArray(response.body.adminUserIds)).toBe(true);
  });

  it("should return bot username as string", async () => {
    const response = await request(app).get("/api/config");

    expect(response.status).toBe(200);
    expect(typeof response.body.botUsername).toBe("string");
    expect(response.body.botUsername).toBe(config.botUsername);
  });

  it("should return admin user IDs as array of strings", async () => {
    const response = await request(app).get("/api/config");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.adminUserIds)).toBe(true);

    // Verify all IDs are strings
    response.body.adminUserIds.forEach((id: unknown) => {
      expect(typeof id).toBe("string");
    });
  });
});
