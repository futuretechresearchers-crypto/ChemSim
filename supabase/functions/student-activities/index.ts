
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "get" | "start" | "submit";

type RequestBody = {
  action?: Action | "getAssignedActivity" | "startAssignedActivity" | "submitAssignedActivity";
  assignment_id?: string;
  assignmentId?: string;
  attempt_id?: string;
  attemptId?: string;
  answers?: Array<{
    question_id?: string;
    questionId?: string;
    answer?: string | null;
    student_answer?: string | null;
  }>;
  client_submitted_at?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLISHABLE_KEY) {
  throw new Error("Required Supabase function environment variables are missing.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function canonicalAction(body: RequestBody): Action {
  switch (body.action) {
    case "getAssignedActivity":
      return "get";
    case "startAssignedActivity":
      return "start";
    case "submitAssignedActivity":
      return "submit";
    case "get":
    case "start":
    case "submit":
      return body.action;
    default:
      throw Object.assign(new Error("Invalid action."), { status: 400 });
  }
}

function assignmentIdFrom(body: RequestBody) {
  return body.assignment_id ?? body.assignmentId ?? "";
}

function attemptIdFrom(body: RequestBody) {
  return body.attempt_id ?? body.attemptId ?? "";
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw Object.assign(new Error("Invalid or expired session."), { status: 401 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw Object.assign(new Error("Unable to verify profile."), { status: 500 });
  }

  if (!profile || profile.role !== "student" || profile.onboarding_completed !== true) {
    throw Object.assign(new Error("A completed student profile is required."), { status: 403 });
  }

  return user;
}

async function loadAssignment(assignmentId: string, studentId: string) {
  if (!assignmentId) {
    throw Object.assign(new Error("assignment_id is required."), { status: 400 });
  }

  const { data: assignment, error } = await admin
    .from("classroom_activity_assignments")
    .select(
      "id, classroom_id, quiz_id, assigned_by, available_from, due_at, is_published, " +
        "quiz:quizzes(id,teacher_id,title,description,instructions,category,difficulty,time_limit_seconds,total_questions,is_published)"
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) throw Object.assign(new Error("Unable to load activity assignment."), { status: 500 });
  if (!assignment) throw Object.assign(new Error("Activity assignment not found."), { status: 404 });

  const { data: membership, error: membershipError } = await admin
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", assignment.classroom_id)
    .eq("student_id", studentId)
    .maybeSingle();

  if (membershipError) {
    throw Object.assign(new Error("Unable to verify classroom membership."), { status: 500 });
  }
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this classroom."), { status: 403 });
  }

  const quiz = Array.isArray(assignment.quiz) ? assignment.quiz[0] : assignment.quiz;
  if (!quiz) throw Object.assign(new Error("Assigned quiz not found."), { status: 404 });

  const { data: classroom, error: classroomError } = await admin
    .from("classrooms")
    .select("teacher_id,is_active")
    .eq("id", assignment.classroom_id)
    .maybeSingle();
  if (classroomError) {
    throw Object.assign(new Error("Unable to verify classroom."), { status: 500 });
  }
  if (!classroom || !classroom.is_active ||
      classroom.teacher_id !== assignment.assigned_by || quiz.teacher_id !== assignment.assigned_by) {
    throw Object.assign(new Error("This activity is unavailable."), { status: 403 });
  }

  if (assignment.is_published !== true || quiz.is_published !== true) {
    throw Object.assign(new Error("This activity is not currently published."), { status: 403 });
  }

  const now = new Date();

  const availableFrom = assignment.available_from ? new Date(assignment.available_from) : null;
  const dueAt = assignment.due_at ? new Date(assignment.due_at) : null;

  // Schedule changes gate new starts; an existing attempt retains its frozen
  // server deadline. Publication/membership checks above still apply.
  const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
    .select("status,effective_deadline")
    .eq("assignment_id", assignmentId).eq("student_id", studentId).maybeSingle();
  if (attemptError) throw Object.assign(new Error("Unable to verify attempt state."), { status: 500 });
  const active = attempt?.status === "in_progress" &&
    (!attempt.effective_deadline || now < new Date(attempt.effective_deadline));

  if (!active && availableFrom && now < availableFrom) {
    return {
      assignment,
      quiz,
      state: "not_yet_available" as const,
      questions: [],
    };
  }

  if (!active && (attempt?.status === "in_progress" || (dueAt && now >= dueAt))) {
    return {
      assignment,
      quiz,
      state: "past_due" as const,
      questions: [],
    };
  }

  const { data: questions, error: questionError } = await admin
    .from("quiz_questions")
    .select("id, question_type, question_text, options, question_order, points")
    .eq("quiz_id", quiz.id)
    .order("question_order", { ascending: true });

  if (questionError) {
    throw Object.assign(new Error("Unable to load activity questions."), { status: 500 });
  }

  return {
    assignment,
    quiz,
    state: "available" as const,
    questions: questions ?? [],
  };
}

function safeActivity(loaded: Awaited<ReturnType<typeof loadAssignment>>) {
  const { assignment, quiz, state, questions } = loaded;
  return {
    server_now: new Date().toISOString(),
    assignment: {
      id: assignment.id,
      classroom_id: assignment.classroom_id,
      quiz_id: assignment.quiz_id,
      available_from: assignment.available_from,
      due_at: assignment.due_at,
      is_published: assignment.is_published,
    },
    activity: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description ?? "",
      instructions: quiz.instructions ?? "",
      category: quiz.category ?? "bonding",
      difficulty: quiz.difficulty ?? "easy",
      time_limit_seconds: Number(quiz.time_limit_seconds ?? 0),
      total_questions: Number(quiz.total_questions ?? questions.length),
      is_published: Boolean(quiz.is_published),
    },
    state,
    questions:
      state === "available"
        ? questions.map((question: any) => ({
            id: question.id,
            question_type: question.question_type,
            question_text: question.question_text,
            options: Array.isArray(question.options) ? question.options : [],
            question_order: Number(question.question_order),
            points: Number(question.points ?? 1),
          }))
        : [],
  };
}

function attemptResult(attempt: any) {
  const total = Number(attempt.total_points ?? 0);
  const earned = Number(attempt.points_earned ?? 0);
  return {
    status: attempt.status,
    attempt_id: attempt.id,
    score: Number(attempt.score ?? 0),
    total_questions: Number(attempt.total_questions ?? 0),
    points_earned: earned,
    total_points: total,
    percentage: total > 0 ? Number(((earned / total) * 100).toFixed(2)) : 0,
    time_taken: attempt.time_taken,
    submitted_at: attempt.submitted_at,
  };
}

async function startActivity(assignmentId: string, studentId: string) {
  // Identity comes exclusively from authenticate(req). Database validates all
  // ownership, publication, membership and time predicates again under locks.
  const { data: attempt, error } = await admin.rpc("phase7_start_attempt", {
    p_assignment_id: assignmentId,
    p_student_id: studentId,
  });
  if (error) throw Object.assign(new Error("Unable to start this activity."), {
    status: error.code === "42501" ? 403 : error.code === "22023" ? 422 : 409,
  });
  if (attempt.status !== "in_progress") {
    // Existing UI expects an active start envelope. Terminal replay is a conflict,
    // with the safe stored result available in its response; no new retake.
    return json(attemptResult(attempt), 409);
  }
  const loaded = await loadAssignment(assignmentId, studentId);
  return json({
    ...safeActivity(loaded),
    attempt: {
      id: attempt.id,
      status: attempt.status,
      started_at: attempt.started_at,
      effective_deadline: attempt.effective_deadline,
      total_questions: attempt.total_questions,
      total_points: attempt.total_points,
    },
  });
}

async function submitActivity(body: RequestBody, assignmentId: string, studentId: string) {
  const attemptId = attemptIdFrom(body);
  if (!attemptId || !Array.isArray(body.answers)) {
    throw Object.assign(new Error("attempt_id and answers are required."), { status: 400 });
  }
  const answers = body.answers.map((item) => {
    if (!item || typeof item !== "object") {
      throw Object.assign(new Error("Invalid answer."), { status: 400 });
    }
    const value = item.answer ?? item.student_answer ?? "";
    if (typeof value !== "string") {
      throw Object.assign(new Error("Invalid answer."), { status: 400 });
    }
    return { question_id: item.question_id ?? item.questionId ?? "", answer: value };
  });
  // A single RPC owns validation, server clock, answers, grading and finalization.
  // Replay returns stored results without requiring current publication.
  const { data: attempt, error } = await admin.rpc("phase7_submit_attempt", {
    p_assignment_id: assignmentId,
    p_attempt_id: attemptId,
    p_student_id: studentId,
    p_answers: answers,
  });
  if (error) throw Object.assign(new Error("Unable to submit this attempt."), {
    status: error.code === "42501" ? 403 : error.code === "22023" ? 400 : 409,
  });
  return json(attemptResult(attempt), attempt.status === "expired" ? 409 : 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await authenticate(req);
    const body = (await req.json()) as RequestBody;
    const action = canonicalAction(body);
    const assignmentId = assignmentIdFrom(body);

    if (action === "get") {
      const loaded = await loadAssignment(assignmentId, user.id);
      return json(safeActivity(loaded));
    }

    if (action === "start") {
      return await startActivity(assignmentId, user.id);
    }

    return await submitActivity(body, assignmentId, user.id);
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message }, Number.isFinite(status) ? status : 500);
  }
});
