import { Router, type Request, type Response } from "express";
import type { Enrollment, User } from "../libs/types.js";
import { authenticateToken } from "../middlewares/authenMiddleware.js";
import { checkRoleAdmin } from "../middlewares/checkRoleAdminMiddleware.js";
import { checkRoles } from "../middlewares/checkRoleAllMiddleware.js";
import type { CustomRequest } from "../libs/types.js";
import { zStudentId, zCourseId } from "../libs/zodValidators.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import { enrollments, users, reset_users, students } from "../db/db.js";

const router = Router();
// GET /api/v2/enrollments
router.get("/",authenticateToken,checkRoleAdmin,(req: CustomRequest, res: Response) => {
    try {
    const studentsList = users.filter(u => u.role === "STUDENT");

    // map นักเรียน กับ enrollments
    const data = studentsList.map(s => {
      const studentCourses = enrollments
        .filter(e => e.studentId === s.studentId)
        .map(e => ({ courseId: e.courseId }));

      return {
        studentId: s.studentId,
        courses: studentCourses,
      };
    });

      return res.json({
        success: true,
        message: "Enrollments Information",
        data,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
      });
    }
  }
);

// POST /api/v2/users/login
router.post("/login",authenticateToken, (req: Request, res: Response) => {
  try {
    //1. get username and password from body
    const { username, password } = req.body;
    const user = users.find(
      (u: User) => u.username === username && u.password === password
    );
    // 2. check if user exists (search with username & password in DB)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password!",
      });
    }
    // 3. create JWT token (with user info object as payload) using JWT_SECRET_KEY
    //(optional: save the token as part of User data)
    const jwt_secret = process.env.JWT_SECRET || "forgot_secret";
    const token = jwt.sign(
      {
        //add jwt payload
        username: user.username,
        studentId: user.studentId,
        role: user.role,
      },
      jwt_secret,
      { expiresIn: "10m" }
    );

    // 4. send HTTP response with JWT token
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: err,
    });
  }

  return res.status(500).json({
    success: false,
    message: "POST /api/v2/users/login has not been implemented yet",
  });
});

// POST /api/v2/enrollments/reset
router.post("/reset", authenticateToken, (req: Request, res: Response) => {
  try {
    reset_users();
    return res.status(200).json({
      success: true,
      message: "enrollments database has been reset",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Something is wrong, please try again",
      error: err,
    });
  }
});

// GET /api/v2/enrollments/:studentId
router.get("/:studentId",authenticateToken,(req: CustomRequest, res: Response) => {
    try {
      const studentId = req.params.studentId;
      const result = zStudentId.safeParse(studentId);
      if (!result.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      const isAuthorized = req.user?.role === "ADMIN" || (req.user?.role === "STUDENT" && req.user.studentId === studentId);
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      const student = students.find(
        (student) => student.studentId === studentId
      );
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      const studentEnrollments = enrollments
        .filter((course) => course.studentId === studentId)
        .map((course) => course.courseId);

      // res.set("Link", `/enrollment/${studentId}`);
      res.status(200).json({
        success: true,
        message: "Student Information",
        data: {
          ...student,
          courses : studentEnrollments,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  }
);

// POST/api/v2/enrollments/:studentId
router.post("/:studentId",authenticateToken,(req: CustomRequest, res: Response) => {
    try {
      const studentId = req.params.studentId;
      const body = req.body as { courseId: string };

      const result = zStudentId.safeParse(studentId);
      if (!result.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      if (req.user?.role === "ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      if (req.user?.role === "STUDENT" && req.user.studentId !== studentId) {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      const student = students.find(
        (student) => student.studentId === studentId
      );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      const alreadyEnrolled = enrollments.some(
        (enrollment) =>
          enrollment.studentId === studentId && enrollment.courseId === body.courseId
      );
      if (alreadyEnrolled) {
        return res.status(409).json({
          success: false,
          message: "studentId && courseId is already exists",
        });
      }

      const newEnrollment: Enrollment = {
        studentId: String(studentId),  // เปลี่ยนเป็น string
        courseId: String(body.courseId), 
};
        //push newEnrollment
      enrollments.push(newEnrollment);
      
      // res.set("Link", `/enrollment/${studentId}`);

      return res.status(201).json({
        success: true,
        message: `Student ${studentId} && Course ${body.courseId} has been added successfully`,
        data: newEnrollment,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  }
);

// DELETE/api/v2/enrollments/:studentId

router.delete("/:studentId",authenticateToken,(req: CustomRequest, res: Response) => {
    try {
      const studentId = req.params.studentId;
      const { courseId } = req.body;
      const courseIdStr = String(courseId);

      const result = zStudentId.safeParse(studentId);
        if (!result.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      if (req.user?.role === "ADMIN") {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to modify another student's data",
        });
      }

      if (req.user?.role === "STUDENT" && req.user.studentId !== studentId) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to modify another student's data",
        });
      }

      const student = students.find((student) => student.studentId === studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      const foundEnroll = enrollments.findIndex((enrollment) =>enrollment.studentId === studentId && enrollment.courseId === courseIdStr );
      if (foundEnroll === -1) {
        return res.status(404).json({
          success: false,
          message: "Enrollment does not exist",
        });
      }

      // delete enrollments

      enrollments.splice(foundEnroll, 1);

      const allEnrollments = enrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
    }));

    // res.set("Link", `/enrollment/${studentId}`);


      return res.status(200).json({
        success: true,
        message: `Student ${studentId} && Course ${courseIdStr} has been deleted successfully`,
        data: allEnrollments,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  }
);
export default router;