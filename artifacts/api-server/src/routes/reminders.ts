import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { remindersTable, doseLogsTable, activityLogTable } from "@workspace/db";
import {
  CreateReminderBody,
  GetReminderParams,
  UpdateReminderParams,
  UpdateReminderBody,
  DeleteReminderParams,
  LogReminderDoseParams,
  LogReminderDoseBody,
} from "@workspace/api-zod";
import { eq, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reminders", async (req, res) => {
  try {
    const reminders = await db.select().from(remindersTable).orderBy(remindersTable.createdAt);
    res.json(reminders);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

router.post("/reminders", async (req, res) => {
  try {
    const body = CreateReminderBody.parse(req.body);
    const [reminder] = await db.insert(remindersTable).values({
      medicationName: body.medicationName,
      dosage: body.dosage,
      frequency: body.frequency,
      times: body.times,
      startDate: body.startDate.toISOString(),
      endDate: body.endDate ? body.endDate.toISOString() : null,
      notes: body.notes ?? null,
      isActive: true,
      color: body.color ?? null,
    }).returning();
    await db.insert(activityLogTable).values({
      type: "reminder_created",
      description: `Added reminder for ${body.medicationName}`,
      medicationName: body.medicationName,
    });
    res.status(201).json(reminder);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Invalid data" });
  }
});

router.get("/reminders/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const reminders = await db.select().from(remindersTable).where(
      and(
        eq(remindersTable.isActive, true),
        lte(remindersTable.startDate, today),
      )
    );

    const todayLogs = await db.select().from(doseLogsTable).where(
      gte(doseLogsTable.createdAt, new Date(today + "T00:00:00Z"))
    );

    const result = reminders.flatMap((reminder) => {
      const times = (reminder.times as string[]);
      return times.map((time) => {
        const log = todayLogs.find(
          (l) => l.reminderId === reminder.id && l.scheduledTime === time
        );
        return {
          id: reminder.id,
          medicationName: reminder.medicationName,
          dosage: reminder.dosage,
          scheduledTime: time,
          status: log ? log.status : "pending",
          color: reminder.color,
        };
      });
    });

    result.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch today's reminders" });
  }
});

router.get("/reminders/:id", async (req, res) => {
  try {
    const { id } = GetReminderParams.parse({ id: Number(req.params.id) });
    const [reminder] = await db.select().from(remindersTable).where(eq(remindersTable.id, id));
    if (!reminder) { res.status(404).json({ error: "Not found" }); return; }
    res.json(reminder);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch reminder" });
  }
});

router.put("/reminders/:id", async (req, res) => {
  try {
    const { id } = UpdateReminderParams.parse({ id: Number(req.params.id) });
    const body = UpdateReminderBody.parse(req.body);
    const [updated] = await db.update(remindersTable)
      .set({
        ...(body.medicationName !== undefined && { medicationName: body.medicationName }),
        ...(body.dosage !== undefined && { dosage: body.dosage }),
        ...(body.frequency !== undefined && { frequency: body.frequency }),
        ...(body.times !== undefined && { times: body.times }),
        ...(body.startDate !== undefined && { startDate: body.startDate.toISOString() }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? body.endDate.toISOString() : null }),
        ...(body.notes !== undefined && { notes: body.notes ?? null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.color !== undefined && { color: body.color ?? null }),
      })
      .where(eq(remindersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    await db.insert(activityLogTable).values({
      type: "reminder_updated",
      description: `Updated reminder for ${updated.medicationName}`,
      medicationName: updated.medicationName,
    });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Invalid data" });
  }
});

router.delete("/reminders/:id", async (req, res) => {
  try {
    const { id } = DeleteReminderParams.parse({ id: Number(req.params.id) });
    await db.delete(remindersTable).where(eq(remindersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete reminder" });
  }
});

router.post("/reminders/:id/log", async (req, res) => {
  try {
    const { id } = LogReminderDoseParams.parse({ id: Number(req.params.id) });
    const body = LogReminderDoseBody.parse(req.body);
    const [reminder] = await db.select().from(remindersTable).where(eq(remindersTable.id, id));
    if (!reminder) { res.status(404).json({ error: "Not found" }); return; }
    const [log] = await db.insert(doseLogsTable).values({
      reminderId: id,
      status: body.status,
      scheduledTime: body.scheduledTime,
      takenAt: body.takenAt ? new Date(body.takenAt) : null,
    }).returning();
    const activityType = body.status === "taken" ? "dose_taken" : "dose_missed";
    const description = body.status === "taken"
      ? `Took ${reminder.medicationName} at ${body.scheduledTime}`
      : `Missed ${reminder.medicationName} at ${body.scheduledTime}`;
    await db.insert(activityLogTable).values({
      type: activityType,
      description,
      medicationName: reminder.medicationName,
    });
    res.status(201).json(log);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Failed to log dose" });
  }
});

export default router;
