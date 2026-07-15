const { query } = require('../config/db');

const EmployeeModel = {
  async create(organizationId, data) {
    const { userId, name, email, phone, department, designation, salary, dateJoined, address } = data;
    const res = await query(
      `INSERT INTO employees (organization_id, user_id, name, email, phone, department, designation, salary, date_joined, address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [organizationId, userId || null, name, email || null, phone || null, department || null,
        designation || null, salary || 0, dateJoined || new Date(), address || null]
    );
    return res.rows[0];
  },

  async findAll(organizationId, { limit, offset, search, department, status }) {
    const conditions = ['organization_id = $1'];
    const params = [organizationId];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (department) {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);
    const res = await query(
      `SELECT * FROM employees ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM employees ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id, organizationId) {
    const res = await query('SELECT * FROM employees WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return res.rows[0];
  },

  async update(id, fields, organizationId) {
    const map = {
      name: 'name', email: 'email', phone: 'phone', department: 'department',
      designation: 'designation', salary: 'salary', status: 'status', address: 'address',
    };
    const keys = Object.keys(fields).filter((k) => map[k]);
    if (keys.length === 0) return this.findById(id, organizationId);
    const setClause = keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id, organizationId);
    const res = await query(
      `UPDATE employees SET ${setClause} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values
    );
    return res.rows[0];
  },

  async delete(id, organizationId) {
    await query('DELETE FROM employees WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },

  // Attendance
  async markAttendance(employeeId, organizationId, date, status, checkIn, checkOut) {
    const res = await query(
      `INSERT INTO attendance (organization_id, employee_id, date, status, check_in, check_out)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (employee_id, date) DO UPDATE SET status = $4, check_in = $5, check_out = $6
       RETURNING *`,
      [organizationId, employeeId, date, status, checkIn || null, checkOut || null]
    );
    return res.rows[0];
  },

  async getAttendance(employeeId, organizationId, month, year) {
    const res = await query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND organization_id = $2
       AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(YEAR FROM date) = $4
       ORDER BY date ASC`,
      [employeeId, organizationId, month, year]
    );
    return res.rows;
  },

  // Leaves
  async requestLeave(employeeId, organizationId, startDate, endDate, reason) {
    const res = await query(
      `INSERT INTO leaves (organization_id, employee_id, start_date, end_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [organizationId, employeeId, startDate, endDate, reason || null]
    );
    return res.rows[0];
  },

  async updateLeaveStatus(leaveId, organizationId, status) {
    const res = await query(
      'UPDATE leaves SET status = $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
      [status, leaveId, organizationId]
    );
    return res.rows[0];
  },

  async getLeaves(employeeId, organizationId) {
    const res = await query(
      'SELECT * FROM leaves WHERE employee_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [employeeId, organizationId]
    );
    return res.rows;
  },
};

module.exports = EmployeeModel;
