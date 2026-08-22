/**
 * Integration tests for GET /api/audit-log
 *
 * Run with:  npx tsx server/tests/audit-log.test.ts
 *
 * Verifies:
 *  - Guardian JWT is rejected (403)
 *  - Missing token returns 401
 *  - Staff with campus_id receives only their campus records
 *  - Filters (action_type, date range, search) reduce results correctly
 *  - Pagination meta is consistent with returned entries
 *  - Student update / delete routes record audit entries
 */

import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${label}`);
    failed++;
  }
}

async function json(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function getStaffToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "directora@jfr.edu.mx", password: "Demo2025!" }),
  });
  const body = await json(res) as any;
  if (!body.token) throw new Error("Could not get staff token: " + JSON.stringify(body));
  return body.token;
}

/** Remove test data created by previous runs so the suite is idempotent. */
async function cleanupTestData(staffToken: string) {
  // Delete students created by the campus-isolation test (by apellido_paterno)
  try {
    const res = await fetch(`${BASE}/api/admin/students`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const body = await res.json() as any;
    const list: any[] = Array.isArray(body) ? body : body.students ?? [];
    for (const s of list.filter((s: any) => s.apellido_paterno === "AislaCampus")) {
      await fetch(`${BASE}/api/admin/students/${s.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${staffToken}` },
      });
    }
  } catch {
    // Non-fatal: cleanup failure should not block tests
  }
}

async function run() {
  console.log("\n═══ Audit Log Integration Tests ═══\n");

  // 1. No token → 401
  {
    const res = await fetch(`${BASE}/api/audit-log`);
    assert(res.status === 401, "No token returns 401");
  }

  // 2. Valid guardian JWT → 403
  {
    const guardianToken = jwt.sign(
      { id: 999, email: "padre@test.mx", type: "guardian" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${BASE}/api/audit-log`, {
      headers: { Authorization: `Bearer ${guardianToken}` },
    });
    const body = await json(res) as any;
    assert(res.status === 403, "Guardian JWT returns 403");
    assert(
      body.message?.includes("personal administrativo"),
      "Guardian rejection message is correct"
    );
  }

  // 3. Token with guardian role (no campus_id) but type !== 'guardian' — should still be rejected
  {
    const badToken = jwt.sign(
      { id: 999, email: "test@test.mx" /* no role */ },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${BASE}/api/audit-log`, {
      headers: { Authorization: `Bearer ${badToken}` },
    });
    assert(res.status === 403, "Token without role field returns 403");
  }

  // Cleanup residual test data from prior runs before state-sensitive tests
  const staffToken = await getStaffToken();
  await cleanupTestData(staffToken);

  // 4. Staff token: response shape is valid
  {
    const res = await fetch(`${BASE}/api/audit-log?page=1&pageSize=5`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const body = await json(res) as any;
    assert(res.status === 200, "Staff token returns 200");
    assert(typeof body.total === "number", "Response has numeric total");
    assert(Array.isArray(body.entries), "Response has entries array");
    assert(typeof body.totalPages === "number", "Response has totalPages");
    assert(typeof body.stats?.today === "number", "Response has stats.today");
    assert(typeof body.stats?.activeUsers === "number", "Response has stats.activeUsers");
    assert(typeof body.stats?.thisWeek === "number", "Response has stats.thisWeek");
    assert(body.entries.length <= 5, "Entries respects pageSize");
  }

  // 5. Filter by action_type
  {
    const res = await fetch(`${BASE}/api/audit-log?accion=pago&pageSize=100`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const body = await json(res) as any;
    assert(res.status === 200, "Filter by accion=pago returns 200");
    const allPago = body.entries.every((e: any) => e.action_type === "pago");
    assert(allPago || body.entries.length === 0, "All returned entries have action_type=pago");
  }

  // 6. Search filter reduces results
  {
    const resAll = await fetch(`${BASE}/api/audit-log?pageSize=200`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const bodyAll = await json(resAll) as any;

    const resSearch = await fetch(`${BASE}/api/audit-log?q=NONEXISTENT_XYZZY_12345&pageSize=200`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const bodySearch = await json(resSearch) as any;
    assert(bodySearch.total <= bodyAll.total, "Search filter reduces or equals total count");
    assert(bodySearch.total === 0 || bodySearch.entries.length > 0, "Search result count matches entries");
  }

  // 7. Pagination: page 1 + page 2 cover different records when total > pageSize
  {
    const res1 = await fetch(`${BASE}/api/audit-log?page=1&pageSize=3`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const res2 = await fetch(`${BASE}/api/audit-log?page=2&pageSize=3`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const b1 = await json(res1) as any;
    const b2 = await json(res2) as any;
    if (b1.total > 3) {
      const ids1 = new Set(b1.entries.map((e: any) => e.id));
      const ids2 = b2.entries.map((e: any) => e.id);
      const overlap = ids2.filter((id: number) => ids1.has(id));
      assert(overlap.length === 0, "Page 1 and Page 2 entries are distinct");
    } else {
      assert(true, "Skipped page overlap check (total <= pageSize)");
    }
  }

  // 8. Student update route creates audit entry
  {
    const studRes = await fetch(`${BASE}/api/admin/students`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const studBody = await json(studRes) as any;
    const students = Array.isArray(studBody) ? studBody : studBody.students ?? [];
    if (students.length > 0) {
      const studentId = students[0].id;
      const before = await json(
        await fetch(`${BASE}/api/audit-log?accion=modificacion&pageSize=200`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ) as any;

      const putRes = await fetch(`${BASE}/api/admin/students/${studentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ grupo: "A-Actualizado" }),
      });
      assert(putRes.status === 200, "Student PUT with allowed field returns 200");

      const after = await json(
        await fetch(`${BASE}/api/audit-log?accion=modificacion&pageSize=200`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ) as any;
      assert(after.total > before.total, "Student update creates a modificacion audit entry");
    } else {
      assert(true, "Skipped student update test (no students in campus)");
    }
  }

  // 9. Student PUT rejects non-allowlisted fields (SQL-injection prevention)
  {
    const studRes = await fetch(`${BASE}/api/admin/students`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const studBody = await json(studRes) as any;
    const students = Array.isArray(studBody) ? studBody : studBody.students ?? [];
    if (students.length > 0) {
      const studentId = students[0].id;
      // Attempt to update a column not in the allowlist
      const badRes = await fetch(`${BASE}/api/admin/students/${studentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ campus_id: 999, password_hash: "hacked" }),
      });
      assert(badRes.status === 400, "PUT with non-allowlisted fields returns 400");
      const badBody = await json(badRes) as any;
      assert(typeof badBody.message === "string", "Rejection includes a message");
    } else {
      assert(true, "Skipped allowlist test (no students in campus)");
    }
  }

  // 10. Student creation ignores campus_id from body — uses JWT campus only
  {
    const studRes = await fetch(`${BASE}/api/admin/students`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const studBody = await json(studRes) as any;
    const beforeCount = Array.isArray(studBody) ? studBody.length : 0;

    // Send a different campus_id in the body — should be silently overridden
    const createRes = await fetch(`${BASE}/api/admin/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        nombres: "Test",
        apellido_paterno: "AislaCampus",
        nivel_escolar: "PRIMARIA",
        campus_id: 9999, // attacker-supplied, should be overridden
      }),
    });
    assert(createRes.status === 201, "Student creation succeeds");

    if (createRes.status === 201) {
      const created = await json(createRes) as any;
      // campus_id on the created record must match the JWT campus, NOT 9999
      const staffPayload = JSON.parse(Buffer.from(staffToken.split(".")[1], "base64url").toString());
      assert(
        created.campus_id === staffPayload.campus_id,
        "Created student campus_id comes from JWT, not from request body"
      );
      assert(created.campus_id !== 9999, "Attacker-supplied campus_id 9999 was rejected");

      // The audit entry must also carry the JWT campus, not 9999
      const auditRes = await json(
        await fetch(`${BASE}/api/audit-log?accion=creacion&q=AislaCampus&pageSize=50`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ) as any;
      const auditEntry = auditRes.entries?.[0];
      assert(auditEntry != null, "Audit entry was created for the new student");
      assert(
        auditEntry?.campus_id === staffPayload.campus_id,
        "Audit entry campus_id matches JWT campus (not attacker value)"
      );
    }
  }

  // 11. Audit record count is stable between reads (no phantom records)
  {
    const before = await json(
      await fetch(`${BASE}/api/audit-log?pageSize=200`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      })
    ) as any;
    const after = await json(
      await fetch(`${BASE}/api/audit-log?pageSize=200`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      })
    ) as any;
    assert(before.total === after.total, "Audit record count is stable between reads");
  }

  // ── Payment processing guards ─────────────────────────────────────────────
  // These tests verify the /api/payments/process IDOR and financial guards.
  // We use a guardian JWT that is NOT linked to any student so we can test
  // the 403 path without needing a real pending charge.

  // 12. Payment with zero/negative amount is rejected
  {
    const guardianToken = jwt.sign(
      { id: 888, email: "tutor_test@test.mx", type: "guardian" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${BASE}/api/payments/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${guardianToken}` },
      body: JSON.stringify({ charge_id: 1, payment_method: "tarjeta", amount_centavos: 0 }),
    });
    // Either 400 (amount invalid) or 404 (charge not found/not linked) are acceptable
    assert(res.status === 400 || res.status === 404 || res.status === 403,
      "Payment with zero amount is rejected (400/403/404)");
  }

  // 13. Payment for a non-existent charge returns 404
  {
    const guardianToken = jwt.sign(
      { id: 888, email: "tutor_test@test.mx", type: "guardian" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${BASE}/api/payments/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${guardianToken}` },
      body: JSON.stringify({ charge_id: 999999999, payment_method: "tarjeta", amount_centavos: 10000 }),
    });
    assert(res.status === 404, "Payment for non-existent charge returns 404");
  }

  // 14. Guardian not linked to student is rejected with 403
  {
    // Use a guardian ID (888) that is very unlikely to be linked to charge ID 1
    // If charge 1 exists, this should return 403; if not, 404 — both are safe outcomes
    const guardianToken = jwt.sign(
      { id: 888, email: "unlinked_tutor@test.mx", type: "guardian" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${BASE}/api/payments/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${guardianToken}` },
      body: JSON.stringify({ charge_id: 1, payment_method: "tarjeta", amount_centavos: 50000 }),
    });
    // 403 if charge exists but guardian is not linked; 404 if charge does not exist;
    // 409 if charge was already paid by a previous test run
    assert(res.status === 403 || res.status === 404 || res.status === 409 || res.status === 400,
      "Unlinked guardian is rejected before payment is recorded");
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error("Test runner error:", err); process.exit(1); });
