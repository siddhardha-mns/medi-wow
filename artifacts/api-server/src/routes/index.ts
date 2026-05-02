import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import remindersRouter from "./reminders";
import dashboardRouter from "./dashboard";
import openaiRouter from "./openai/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(remindersRouter);
router.use(dashboardRouter);
router.use(openaiRouter);

export default router;
