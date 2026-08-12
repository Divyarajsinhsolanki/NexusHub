import { describe, expect, it } from "vitest";
import {
  buildDistributionPlan,
  buildTaskStageRows,
  resolveDefaultLogDate,
  validateStageSelection,
} from "./bulkLogPlanner";

const developers = [
  { id: 1, name: "Dev One", email: "dev@example.test" },
  { id: 2, name: "Reviewer One", email: "reviewer@example.test" },
  { id: 3, name: "Riya QA", email: "riya@example.test" },
];

describe("bulkLogPlanner", () => {
  it("builds stage rows from task hour breakdowns and stage assignees", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 10,
          task_id: "TASK-10",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          qa_assigned: "Riya QA",
          dev_hours: 8,
          code_review_hours: 2,
          dev_to_qa_hours: 1,
          qa_hours: 3,
        },
      ],
    });

    expect(rows.map((row) => row.stageLabel)).toEqual(["Code", "Code Review", "Dev to QA", "QA"]);
    expect(rows.map((row) => row.developerId)).toEqual(["1", "2", "1", "3"]);
    expect(rows.map((row) => row.plannedHours)).toEqual([8, 2, 1, 3]);
  });

  it("starts review on the next sprint day after code finishes", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 11,
          task_id: "TASK-11",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 8,
          code_review_hours: 2,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
      startDate: "2026-06-01",
      maxHoursPerDay: 8,
      existingLogs: [],
    });

    expect(plan.entries).toEqual([
      {
        task_id: 11,
        developer_id: 1,
        log_date: "2026-06-01",
        type: "Code",
        hours_logged: 8,
        status: "todo",
      },
      {
        task_id: 11,
        developer_id: 2,
        log_date: "2026-06-02",
        type: "Code review",
        hours_logged: 2,
        status: "todo",
      },
    ]);
  });

  it("hands every stage off on the next sprint day even when assignees have same-day capacity", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 16,
          task_id: "TASK-16",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 4,
          code_review_hours: 2,
          dev_to_qa_hours: 1,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => [entry.type, entry.log_date, entry.hours_logged])).toEqual([
      ["Code", "2026-06-01", 4],
      ["Code review", "2026-06-02", 2],
      ["Dev to QA", "2026-06-03", 1],
    ]);
    expect(plan.unallocatedHours).toBe(0);
  });

  it("moves review to the next day after a full seven-hour code day", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 17,
          task_id: "TASK-17",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 7,
          code_review_hours: 2,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => [entry.type, entry.log_date])).toEqual([
      ["Code", "2026-06-01"],
      ["Code review", "2026-06-02"],
    ]);
  });

  it("rolls review forward when the reviewer has no same-day capacity", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 18,
          task_id: "TASK-18",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 4,
          code_review_hours: 2,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [{
        task_id: 99,
        developer_id: 2,
        log_date: "2026-06-01",
        type: "Code",
        hours_logged: 7,
      }],
    });

    expect(plan.entries.find((entry) => entry.type === "Code review")?.log_date).toBe("2026-06-02");
  });

  it("places Dev to QA on the day after Code Review", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 19,
          task_id: "TASK-19",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 2,
          code_review_hours: 7,
          dev_to_qa_hours: 1,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => [entry.type, entry.log_date])).toEqual([
      ["Code", "2026-06-01"],
      ["Code review", "2026-06-02"],
      ["Dev to QA", "2026-06-03"],
    ]);
  });

  it("pipelines several tasks across early days instead of collecting handoffs on the final date", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 31,
          task_id: "TASK-31",
          type: "Code",
          order: 1,
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 7,
          code_review_hours: 2,
          dev_to_qa_hours: 1,
        },
        {
          id: 32,
          task_id: "TASK-32",
          type: "Code",
          order: 2,
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 7,
          code_review_hours: 2,
          dev_to_qa_hours: 1,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.filter((entry) => entry.type === "Code review").map((entry) => [entry.task_id, entry.log_date])).toEqual([
      [31, "2026-06-02"],
      [32, "2026-06-03"],
    ]);
    expect(plan.entries.filter((entry) => entry.type === "Dev to QA").map((entry) => [entry.task_id, entry.log_date])).toEqual([
      [31, "2026-06-03"],
      [32, "2026-06-04"],
    ]);
    expect(plan.unallocatedHours).toBe(0);
  });

  it("builds bulk log entries in sprint task order instead of task key order", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 21,
          task_id: "TASK-2",
          type: "Code",
          developer_id: 1,
          order: 1,
          dev_hours: 1,
        },
        {
          id: 22,
          task_id: "TASK-1",
          type: "Code",
          developer_id: 1,
          order: 2,
          dev_hours: 1,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01"],
      startDate: "2026-06-01",
      maxHoursPerDay: 8,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => entry.task_id)).toEqual([21, 22]);
  });

  it("allows Code Review on the final sprint day when Code completes there", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 12,
          task_id: "TASK-12",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 7,
          code_review_hours: 2,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => [entry.type, entry.log_date, entry.hours_logged])).toEqual([
      ["Code", "2026-06-01", 7],
      ["Code review", "2026-06-01", 2],
    ]);
    expect(plan.finalDayHandoffCount).toBe(1);
    expect(plan.unallocatedHours).toBe(0);
    expect(plan.unallocatedStages).toEqual([]);
  });

  it("closes Code Review and Dev to QA on the final day in dependency order", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [{
        id: 34,
        task_id: "TASK-34",
        type: "Code",
        developer_id: 1,
        assigned_to_user: 2,
        dev_hours: 4,
        code_review_hours: 2,
        dev_to_qa_hours: 1,
      }],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [],
    });

    expect(plan.entries.map((entry) => [entry.type, entry.log_date, entry.hours_logged])).toEqual([
      ["Code", "2026-06-01", 4],
      ["Code review", "2026-06-01", 2],
      ["Dev to QA", "2026-06-01", 1],
    ]);
    expect(plan.finalDayHandoffCount).toBe(2);
    expect(plan.unallocatedHours).toBe(0);
  });

  it("reports a missing following day before reviewer capacity", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 20,
          task_id: "TASK-20",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 7,
          code_review_hours: 2,
        },
      ],
    });

    const plan = buildDistributionPlan({
      rows,
      dates: ["2026-06-01"],
      startDate: "2026-06-01",
      maxHoursPerDay: 7,
      existingLogs: [{
        task_id: 98,
        developer_id: 2,
        log_date: "2026-06-01",
        type: "Code",
        hours_logged: 7,
      }],
    });

    expect(plan.entries.map((entry) => entry.type)).toEqual(["Code"]);
    expect(plan.unallocatedStages).toEqual([
      expect.objectContaining({ stageKey: "code_review", hours: 2, reason: "outside_sprint" }),
    ]);
  });

  it("blocks a selected stage when an earlier stage still has remaining hours", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [],
      viewMode: "combined",
      tasks: [
        {
          id: 13,
          task_id: "TASK-13",
          type: "Code",
          developer_id: 1,
          assigned_to_user: 2,
          dev_hours: 8,
          code_review_hours: 2,
        },
      ],
    }).map((row) => (
      row.stageKey === "code" ? { ...row, selected: false } : row
    ));

    expect(validateStageSelection(rows)).toMatchObject({
      valid: false,
      message: "Code Review for TASK-13 needs Code completed first.",
    });
  });

  it("counts existing QA logs against the QA stage instead of the whole task", () => {
    const rows = buildTaskStageRows({
      developers,
      existingLogs: [
        {
          task_id: 14,
          developer_id: 3,
          log_date: "2026-06-01",
          type: "Testing",
          hours_logged: 2,
        },
      ],
      viewMode: "qa",
      tasks: [
        {
          id: 14,
          task_id: "TASK-14",
          type: "qa",
          assigned_to_user: 3,
          qa_hours: 5,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stageLabel: "QA",
      loggedHours: 2,
      remainingHours: 3,
      hours: "3",
    });
  });

  it("ignores task logs outside the sprint date window when calculating remaining hours", () => {
    const rows = buildTaskStageRows({
      developers,
      dates: ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
      existingLogs: [
        {
          task_id: 15,
          developer_id: 1,
          log_date: "2026-07-14",
          type: "Code",
          hours_logged: 16,
        },
      ],
      viewMode: "combined",
      tasks: [
        {
          id: 15,
          task_id: "MYFR-2912",
          type: "Code",
          developer_id: 1,
          dev_hours: 16,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stageLabel: "Code",
      plannedHours: 16,
      loggedHours: 0,
      remainingHours: 16,
      hours: "16",
    });
  });

  it("defaults to the first sprint day when today is outside the sprint", () => {
    expect(resolveDefaultLogDate(["2020-06-03", "2020-06-01", "2020-06-02"])).toBe("2020-06-01");
  });

  it("defaults to the first sprint day even when today is inside the sprint", () => {
    const today = new Date().toISOString().slice(0, 10);
    const previousDate = new Date(`${today}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 2);
    const nextDate = new Date(`${today}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 2);

    expect(resolveDefaultLogDate([
      today,
      nextDate.toISOString().slice(0, 10),
      previousDate.toISOString().slice(0, 10),
    ])).toBe(previousDate.toISOString().slice(0, 10));
  });
});
