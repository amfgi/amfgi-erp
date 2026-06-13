import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getMonthlyJobSummary } from '@/app/api/reports/monthly-job-summary/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Monthly job summary report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['report.view', 'job.view', 'material.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('returns consumption, production, costing, and work hours per variation job sheet', async () => {
    await prisma.company.update({
      where: { id: ctx.amfgiCompany.id },
      data: { onboardingStatus: 'OPERATIONAL' },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Monthly WH ${Date.now().toString(36)}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Monthly Summary Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `MS-PARENT-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        jobWorkValue: 5000,
        createdBy: ctx.admin.id,
      },
    });

    const variationJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `MS-VAR-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Monthly Cement',
        externalItemName: 'QB-CEMENT-01',
        unit: 'bag',
        stockType: 'STOCK',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        currentStock: 100,
        unitCost: 25,
      },
    });

    const jobItem = await prisma.jobItem.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobId: parentJob.id,
        name: 'Concrete pour',
        specifications: {},
        createdBy: ctx.admin.id,
        trackingEnabled: true,
        trackingLabel: 'Volume',
        trackingUnit: 'm3',
      },
    });

    const txnDate = new Date();
    const from = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-${String(txnDate.getDate()).padStart(2, '0')}`;

    await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        jobId: variationJob.id,
        quantity: 10,
        totalCost: 250,
        averageCost: 25,
        date: txnDate,
        performedBy: ctx.admin.id,
      },
    });

    await prisma.jobItemProgressEntry.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobItemId: jobItem.id,
        entryDate: txnDate,
        quantity: 12,
        createdBy: ctx.admin.id,
      },
    });

    const schedule = await prisma.workSchedule.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        workDate: txnDate,
        status: 'PUBLISHED',
      },
    });

    const assignment = await prisma.workAssignment.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        workScheduleId: schedule.id,
        columnIndex: 0,
        label: 'Site team',
        jobId: variationJob.id,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        employeeCode: `MS-${Date.now().toString(36).toUpperCase()}`,
        fullName: 'Monthly Worker',
      },
    });

    const checkIn = new Date(txnDate);
    checkIn.setHours(8, 0, 0, 0);
    const checkOut = new Date(txnDate);
    checkOut.setHours(17, 0, 0, 0);

    await prisma.attendanceEntry.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        employeeId: employee.id,
        workDate: txnDate,
        workAssignmentId: assignment.id,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        status: 'PRESENT',
      },
    });

    const response = await getMonthlyJobSummary(
      new Request(
        `http://localhost/api/reports/monthly-job-summary?from=${from}&to=${to}&jobId[]=${variationJob.id}&groupBy=variation&materialLabel=external`,
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.sheets).toHaveLength(1);

    const sheet = json.data.sheets[0];
    expect(sheet.jobNumber).toBe(variationJob.jobNumber);
    expect(sheet.activity.hasStockTransactions).toBe(true);
    expect(sheet.activity.hasWorkAssignment).toBe(true);
    expect(sheet.consumption).toHaveLength(1);
    expect(sheet.consumption[0].materialLabel).toBe('QB-CEMENT-01');
    expect(sheet.consumption[0].netQty).toBe(10);
    expect(sheet.production).toHaveLength(1);
    expect(sheet.production[0].producedQty).toBe(12);
    expect(sheet.costing.periodNetMaterialCost).toBe(250);
    expect(sheet.costing.totalNetMaterialCostTillNow).toBe(250);
    expect(sheet.totalNetMaterialCostTillNow).toBe(250);
    expect(sheet.workHours).toHaveLength(1);
    expect(sheet.workHours[0].workedHours).toBe(9);
    expect(sheet.workHoursTotalTillNow.workedHours).toBe(9);
  });

  it('combines consumption for materials that share the same external item name', async () => {
    await prisma.company.update({
      where: { id: ctx.amfgiCompany.id },
      data: { onboardingStatus: 'OPERATIONAL' },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Monthly Combine WH ${Date.now().toString(36)}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Monthly Combine Customer ${Date.now().toString(36)}`,
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `MS-COMBINE-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const materialA = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Sand Lot A',
        externalItemName: 'QB-SAND-01',
        unit: 'bag',
        stockType: 'STOCK',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        currentStock: 100,
        unitCost: 20,
      },
    });

    const materialB = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Sand Lot B',
        externalItemName: 'QB-SAND-01',
        unit: 'bag',
        stockType: 'STOCK',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        currentStock: 100,
        unitCost: 35,
      },
    });

    const txnDate = new Date();
    const from = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-${String(txnDate.getDate()).padStart(2, '0')}`;

    await prisma.transaction.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: materialA.id,
          jobId: job.id,
          quantity: 10,
          totalCost: 200,
          averageCost: 20,
          date: txnDate,
          performedBy: ctx.admin.id,
        },
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: materialB.id,
          jobId: job.id,
          quantity: 5,
          totalCost: 175,
          averageCost: 35,
          date: txnDate,
          performedBy: ctx.admin.id,
        },
      ],
    });

    const response = await getMonthlyJobSummary(
      new Request(
        `http://localhost/api/reports/monthly-job-summary?from=${from}&to=${to}&jobId[]=${job.id}&groupBy=variation&materialLabel=external&includeProduction=false&includeCosting=false&includeWorkHours=false`,
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.sheets[0].consumption).toHaveLength(1);
    expect(json.data.sheets[0].consumption[0]).toMatchObject({
      materialLabel: 'QB-SAND-01',
      netQty: 15,
      netCost: 375,
      unitCost: 25,
    });
  });

  it('rolls variation activity up to the parent job when groupBy=parent', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Parent Rollup Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `MS-PARENT-ROLLUP-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const variationJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `MS-VAR-ROLLUP-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const txnDate = new Date();
    txnDate.setDate(txnDate.getDate() - 1);
    const from = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}-${String(txnDate.getDate()).padStart(2, '0')}`;

    const schedule = await prisma.workSchedule.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        workDate: txnDate,
        status: 'PUBLISHED',
      },
    });

    await prisma.workAssignment.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        workScheduleId: schedule.id,
        columnIndex: 1,
        label: 'Variation team',
        jobId: variationJob.id,
      },
    });

    const response = await getMonthlyJobSummary(
      new Request(
        `http://localhost/api/reports/monthly-job-summary?from=${from}&to=${to}&groupBy=parent&includeProduction=false&includeCosting=false&includeWorkHours=false`,
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.groupBy).toBe('parent');
    expect(json.data.sheets).toHaveLength(1);
    expect(json.data.sheets[0].jobNumber).toBe(parentJob.jobNumber);
    expect(json.data.sheets[0].activity.hasWorkAssignment).toBe(true);
  });
});
