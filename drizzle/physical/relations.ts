import { relations } from "drizzle-orm/relations";
import { campuses, chargeSurchargePeriods, charges, paymentSurchargeRules, tenants, paymentDueDatePeriods, concepts, paymentApplications, familyCredits, families, payments, students, scholarshipTypes, scholarshipCriteria, users, guardians, scholarshipBenefits, products, auditLog, paymentPlans, institutionalSettings, campusPaymentConfig, bankTransactions, paymentPlanInstallments, scholarshipAutoRules, paymentRules, collectionActivities, paymentEvents, invoices, cashClosures, accionesSeguimiento, scholarshipAutoAssignments, scholarships, chargeScholarshipApplications, paymentDueDates, paymentMethods, discounts, notifications, institutionalCredentials, institutionalInfo, platformMetrics, reconciliationBatches, securityEvents, financialEvents, campusInvoicingConfig, lateFeeCalculations, familyPaymentSources, familyStudents, studentGuardian } from "./schema";

export const chargeSurchargePeriodsRelations = relations(chargeSurchargePeriods, ({one}) => ({
	campus: one(campuses, {
		fields: [chargeSurchargePeriods.campusId],
		references: [campuses.id]
	}),
	charge: one(charges, {
		fields: [chargeSurchargePeriods.chargeId],
		references: [charges.id]
	}),
	paymentSurchargeRule: one(paymentSurchargeRules, {
		fields: [chargeSurchargePeriods.paymentRuleId],
		references: [paymentSurchargeRules.id]
	}),
	tenant: one(tenants, {
		fields: [chargeSurchargePeriods.tenantId],
		references: [tenants.id]
	}),
}));

export const campusesRelations = relations(campuses, ({one, many}) => ({
	chargeSurchargePeriods: many(chargeSurchargePeriods),
	paymentDueDatePeriods: many(paymentDueDatePeriods),
	families: many(families),
	products: many(products),
	institutionalSettings: many(institutionalSettings),
	campusPaymentConfigs: many(campusPaymentConfig),
	bankTransactions: many(bankTransactions),
	paymentPlans: many(paymentPlans),
	scholarshipAutoRules: many(scholarshipAutoRules),
	guardians: many(guardians),
	paymentRules: many(paymentRules),
	collectionActivities: many(collectionActivities),
	cashClosures: many(cashClosures),
	accionesSeguimientos: many(accionesSeguimiento),
	users: many(users),
	scholarshipAutoAssignments: many(scholarshipAutoAssignments),
	scholarshipTypes: many(scholarshipTypes),
	concepts: many(concepts),
	students: many(students),
	discounts: many(discounts),
	tenant: one(tenants, {
		fields: [campuses.tenantId],
		references: [tenants.id]
	}),
	institutionalCredentials: many(institutionalCredentials),
	reconciliationBatches: many(reconciliationBatches),
	securityEvents: many(securityEvents),
	financialEvents: many(financialEvents),
	campusInvoicingConfigs: many(campusInvoicingConfig),
}));

export const chargesRelations = relations(charges, ({one, many}) => ({
	chargeSurchargePeriods: many(chargeSurchargePeriods),
	concept: one(concepts, {
		fields: [charges.conceptId],
		references: [concepts.id]
	}),
	paymentPlan: one(paymentPlans, {
		fields: [charges.planId],
		references: [paymentPlans.id]
	}),
	student: one(students, {
		fields: [charges.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [charges.tenantId],
		references: [tenants.id]
	}),
	paymentApplications: many(paymentApplications),
	bankTransactions: many(bankTransactions),
	collectionActivities: many(collectionActivities),
	chargeScholarshipApplications: many(chargeScholarshipApplications),
	payments: many(payments),
	lateFeeCalculations: many(lateFeeCalculations),
}));

export const paymentSurchargeRulesRelations = relations(paymentSurchargeRules, ({one, many}) => ({
	chargeSurchargePeriods: many(chargeSurchargePeriods),
	concept: one(concepts, {
		fields: [paymentSurchargeRules.conceptId],
		references: [concepts.id]
	}),
	tenant: one(tenants, {
		fields: [paymentSurchargeRules.tenantId],
		references: [tenants.id]
	}),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	chargeSurchargePeriods: many(chargeSurchargePeriods),
	paymentDueDatePeriods: many(paymentDueDatePeriods),
	familyCredits: many(familyCredits),
	families: many(families),
	products: many(products),
	auditLogs: many(auditLog),
	charges: many(charges),
	institutionalSettings: many(institutionalSettings),
	campusPaymentConfigs: many(campusPaymentConfig),
	bankTransactions: many(bankTransactions),
	paymentPlans: many(paymentPlans),
	scholarshipAutoRules: many(scholarshipAutoRules),
	paymentSurchargeRules: many(paymentSurchargeRules),
	guardians: many(guardians),
	paymentRules: many(paymentRules),
	collectionActivities: many(collectionActivities),
	paymentEvents: many(paymentEvents),
	invoices: many(invoices),
	cashClosures: many(cashClosures),
	accionesSeguimientos: many(accionesSeguimiento),
	users: many(users),
	scholarshipAutoAssignments: many(scholarshipAutoAssignments),
	chargeScholarshipApplications: many(chargeScholarshipApplications),
	payments: many(payments),
	concepts: many(concepts),
	students: many(students),
	paymentDueDates: many(paymentDueDates),
	paymentMethods: many(paymentMethods),
	scholarships: many(scholarships),
	discounts: many(discounts),
	notifications: many(notifications),
	campuses: many(campuses),
	institutionalCredentials: many(institutionalCredentials),
	institutionalInfos: many(institutionalInfo),
	platformMetrics: many(platformMetrics),
	reconciliationBatches: many(reconciliationBatches),
	securityEvents: many(securityEvents),
	financialEvents: many(financialEvents),
	campusInvoicingConfigs: many(campusInvoicingConfig),
	lateFeeCalculations: many(lateFeeCalculations),
	familyPaymentSources: many(familyPaymentSources),
}));

export const paymentDueDatePeriodsRelations = relations(paymentDueDatePeriods, ({one}) => ({
	campus: one(campuses, {
		fields: [paymentDueDatePeriods.campusId],
		references: [campuses.id]
	}),
	concept: one(concepts, {
		fields: [paymentDueDatePeriods.conceptId],
		references: [concepts.id]
	}),
	tenant: one(tenants, {
		fields: [paymentDueDatePeriods.tenantId],
		references: [tenants.id]
	}),
}));

export const conceptsRelations = relations(concepts, ({one, many}) => ({
	paymentDueDatePeriods: many(paymentDueDatePeriods),
	charges: many(charges),
	paymentSurchargeRules: many(paymentSurchargeRules),
	campus: one(campuses, {
		fields: [concepts.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [concepts.tenantId],
		references: [tenants.id]
	}),
	paymentDueDates: many(paymentDueDates),
}));

export const familyCreditsRelations = relations(familyCredits, ({one}) => ({
	paymentApplication: one(paymentApplications, {
		fields: [familyCredits.consumedApplicationId],
		references: [paymentApplications.id]
	}),
	family: one(families, {
		fields: [familyCredits.familyId],
		references: [families.id]
	}),
	payment: one(payments, {
		fields: [familyCredits.paymentId],
		references: [payments.id]
	}),
	student: one(students, {
		fields: [familyCredits.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [familyCredits.tenantId],
		references: [tenants.id]
	}),
}));

export const paymentApplicationsRelations = relations(paymentApplications, ({one, many}) => ({
	familyCredits: many(familyCredits),
	charge: one(charges, {
		fields: [paymentApplications.chargeId],
		references: [charges.id]
	}),
	payment: one(payments, {
		fields: [paymentApplications.paymentId],
		references: [payments.id]
	}),
}));

export const familiesRelations = relations(families, ({one, many}) => ({
	familyCredits: many(familyCredits),
	user: one(users, {
		fields: [families.archivedBy],
		references: [users.id]
	}),
	campus: one(campuses, {
		fields: [families.campusId],
		references: [campuses.id]
	}),
	guardian: one(guardians, {
		fields: [families.guardianIdPrincipal],
		references: [guardians.id]
	}),
	tenant: one(tenants, {
		fields: [families.tenantId],
		references: [tenants.id]
	}),
	familyPaymentSources: many(familyPaymentSources),
	familyStudents: many(familyStudents),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	familyCredits: many(familyCredits),
	paymentApplications: many(paymentApplications),
	bankTransactions: many(bankTransactions),
	invoices: many(invoices),
	charge: one(charges, {
		fields: [payments.chargeId],
		references: [charges.id]
	}),
	guardian: one(guardians, {
		fields: [payments.guardianId],
		references: [guardians.id]
	}),
	tenant: one(tenants, {
		fields: [payments.tenantId],
		references: [tenants.id]
	}),
}));

export const studentsRelations = relations(students, ({one, many}) => ({
	familyCredits: many(familyCredits),
	charges: many(charges),
	paymentPlans: many(paymentPlans),
	collectionActivities: many(collectionActivities),
	scholarshipAutoAssignments: many(scholarshipAutoAssignments),
	campus: one(campuses, {
		fields: [students.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [students.tenantId],
		references: [tenants.id]
	}),
	scholarships: many(scholarships),
	notifications: many(notifications),
	familyStudents: many(familyStudents),
	studentGuardians: many(studentGuardian),
}));

export const scholarshipCriteriaRelations = relations(scholarshipCriteria, ({one}) => ({
	scholarshipType: one(scholarshipTypes, {
		fields: [scholarshipCriteria.scholarshipTypeId],
		references: [scholarshipTypes.id]
	}),
}));

export const scholarshipTypesRelations = relations(scholarshipTypes, ({one, many}) => ({
	scholarshipCriteria: many(scholarshipCriteria),
	scholarshipBenefits: many(scholarshipBenefits),
	campus: one(campuses, {
		fields: [scholarshipTypes.campusId],
		references: [campuses.id]
	}),
	scholarships: many(scholarships),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	families: many(families),
	auditLogs: many(auditLog),
	paymentPlans: many(paymentPlans),
	collectionActivities: many(collectionActivities),
	cashClosures: many(cashClosures),
	accionesSeguimientos_assignedTo: many(accionesSeguimiento, {
		relationName: "accionesSeguimiento_assignedTo_users_id"
	}),
	accionesSeguimientos_createdBy: many(accionesSeguimiento, {
		relationName: "accionesSeguimiento_createdBy_users_id"
	}),
	campus: one(campuses, {
		fields: [users.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id]
	}),
	notifications: many(notifications),
	institutionalCredentials: many(institutionalCredentials),
	securityEvents: many(securityEvents),
}));

export const guardiansRelations = relations(guardians, ({one, many}) => ({
	families: many(families),
	auditLogs: many(auditLog),
	paymentPlans: many(paymentPlans),
	campus: one(campuses, {
		fields: [guardians.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [guardians.tenantId],
		references: [tenants.id]
	}),
	payments: many(payments),
	paymentMethods: many(paymentMethods),
	notifications: many(notifications),
	studentGuardians: many(studentGuardian),
}));

export const scholarshipBenefitsRelations = relations(scholarshipBenefits, ({one}) => ({
	scholarshipType: one(scholarshipTypes, {
		fields: [scholarshipBenefits.scholarshipTypeId],
		references: [scholarshipTypes.id]
	}),
}));

export const productsRelations = relations(products, ({one}) => ({
	campus: one(campuses, {
		fields: [products.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [products.tenantId],
		references: [tenants.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	guardian: one(guardians, {
		fields: [auditLog.guardianId],
		references: [guardians.id]
	}),
	tenant: one(tenants, {
		fields: [auditLog.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [auditLog.userId],
		references: [users.id]
	}),
}));

export const paymentPlansRelations = relations(paymentPlans, ({one, many}) => ({
	charges: many(charges),
	paymentPlanInstallments: many(paymentPlanInstallments),
	campus: one(campuses, {
		fields: [paymentPlans.campusId],
		references: [campuses.id]
	}),
	user: one(users, {
		fields: [paymentPlans.createdBy],
		references: [users.id]
	}),
	guardian: one(guardians, {
		fields: [paymentPlans.guardianId],
		references: [guardians.id]
	}),
	student: one(students, {
		fields: [paymentPlans.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [paymentPlans.tenantId],
		references: [tenants.id]
	}),
}));

export const institutionalSettingsRelations = relations(institutionalSettings, ({one}) => ({
	campus: one(campuses, {
		fields: [institutionalSettings.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [institutionalSettings.tenantId],
		references: [tenants.id]
	}),
}));

export const campusPaymentConfigRelations = relations(campusPaymentConfig, ({one}) => ({
	campus: one(campuses, {
		fields: [campusPaymentConfig.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [campusPaymentConfig.tenantId],
		references: [tenants.id]
	}),
}));

export const bankTransactionsRelations = relations(bankTransactions, ({one}) => ({
	campus: one(campuses, {
		fields: [bankTransactions.campusId],
		references: [campuses.id]
	}),
	charge: one(charges, {
		fields: [bankTransactions.chargeId],
		references: [charges.id]
	}),
	payment: one(payments, {
		fields: [bankTransactions.paymentId],
		references: [payments.id]
	}),
	tenant: one(tenants, {
		fields: [bankTransactions.tenantId],
		references: [tenants.id]
	}),
}));

export const paymentPlanInstallmentsRelations = relations(paymentPlanInstallments, ({one}) => ({
	paymentPlan: one(paymentPlans, {
		fields: [paymentPlanInstallments.planId],
		references: [paymentPlans.id]
	}),
}));

export const scholarshipAutoRulesRelations = relations(scholarshipAutoRules, ({one, many}) => ({
	campus: one(campuses, {
		fields: [scholarshipAutoRules.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [scholarshipAutoRules.tenantId],
		references: [tenants.id]
	}),
	scholarshipAutoAssignments: many(scholarshipAutoAssignments),
}));

export const paymentRulesRelations = relations(paymentRules, ({one, many}) => ({
	campus: one(campuses, {
		fields: [paymentRules.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [paymentRules.tenantId],
		references: [tenants.id]
	}),
	lateFeeCalculations: many(lateFeeCalculations),
}));

export const collectionActivitiesRelations = relations(collectionActivities, ({one}) => ({
	campus: one(campuses, {
		fields: [collectionActivities.campusId],
		references: [campuses.id]
	}),
	charge: one(charges, {
		fields: [collectionActivities.chargeId],
		references: [charges.id]
	}),
	user: one(users, {
		fields: [collectionActivities.createdBy],
		references: [users.id]
	}),
	student: one(students, {
		fields: [collectionActivities.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [collectionActivities.tenantId],
		references: [tenants.id]
	}),
}));

export const paymentEventsRelations = relations(paymentEvents, ({one}) => ({
	tenant: one(tenants, {
		fields: [paymentEvents.tenantId],
		references: [tenants.id]
	}),
}));

export const invoicesRelations = relations(invoices, ({one}) => ({
	payment: one(payments, {
		fields: [invoices.paymentId],
		references: [payments.id]
	}),
	tenant: one(tenants, {
		fields: [invoices.tenantId],
		references: [tenants.id]
	}),
}));

export const cashClosuresRelations = relations(cashClosures, ({one}) => ({
	campus: one(campuses, {
		fields: [cashClosures.campusId],
		references: [campuses.id]
	}),
	user: one(users, {
		fields: [cashClosures.closedByUserId],
		references: [users.id]
	}),
	tenant: one(tenants, {
		fields: [cashClosures.tenantId],
		references: [tenants.id]
	}),
}));

export const accionesSeguimientoRelations = relations(accionesSeguimiento, ({one}) => ({
	user_assignedTo: one(users, {
		fields: [accionesSeguimiento.assignedTo],
		references: [users.id],
		relationName: "accionesSeguimiento_assignedTo_users_id"
	}),
	campus: one(campuses, {
		fields: [accionesSeguimiento.campusId],
		references: [campuses.id]
	}),
	user_createdBy: one(users, {
		fields: [accionesSeguimiento.createdBy],
		references: [users.id],
		relationName: "accionesSeguimiento_createdBy_users_id"
	}),
	tenant: one(tenants, {
		fields: [accionesSeguimiento.tenantId],
		references: [tenants.id]
	}),
}));

export const scholarshipAutoAssignmentsRelations = relations(scholarshipAutoAssignments, ({one}) => ({
	campus: one(campuses, {
		fields: [scholarshipAutoAssignments.campusId],
		references: [campuses.id]
	}),
	scholarshipAutoRule: one(scholarshipAutoRules, {
		fields: [scholarshipAutoAssignments.ruleId],
		references: [scholarshipAutoRules.id]
	}),
	scholarship: one(scholarships, {
		fields: [scholarshipAutoAssignments.scholarshipId],
		references: [scholarships.id]
	}),
	student: one(students, {
		fields: [scholarshipAutoAssignments.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [scholarshipAutoAssignments.tenantId],
		references: [tenants.id]
	}),
}));

export const scholarshipsRelations = relations(scholarships, ({one, many}) => ({
	scholarshipAutoAssignments: many(scholarshipAutoAssignments),
	chargeScholarshipApplications: many(chargeScholarshipApplications),
	scholarshipType: one(scholarshipTypes, {
		fields: [scholarships.scholarshipTypeId],
		references: [scholarshipTypes.id]
	}),
	student: one(students, {
		fields: [scholarships.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [scholarships.tenantId],
		references: [tenants.id]
	}),
}));

export const chargeScholarshipApplicationsRelations = relations(chargeScholarshipApplications, ({one}) => ({
	charge: one(charges, {
		fields: [chargeScholarshipApplications.chargeId],
		references: [charges.id]
	}),
	scholarship: one(scholarships, {
		fields: [chargeScholarshipApplications.scholarshipId],
		references: [scholarships.id]
	}),
	tenant: one(tenants, {
		fields: [chargeScholarshipApplications.tenantId],
		references: [tenants.id]
	}),
}));

export const paymentDueDatesRelations = relations(paymentDueDates, ({one}) => ({
	concept: one(concepts, {
		fields: [paymentDueDates.conceptId],
		references: [concepts.id]
	}),
	tenant: one(tenants, {
		fields: [paymentDueDates.tenantId],
		references: [tenants.id]
	}),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({one}) => ({
	guardian: one(guardians, {
		fields: [paymentMethods.guardianId],
		references: [guardians.id]
	}),
	tenant: one(tenants, {
		fields: [paymentMethods.tenantId],
		references: [tenants.id]
	}),
}));

export const discountsRelations = relations(discounts, ({one}) => ({
	campus: one(campuses, {
		fields: [discounts.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [discounts.tenantId],
		references: [tenants.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	guardian: one(guardians, {
		fields: [notifications.guardianId],
		references: [guardians.id]
	}),
	student: one(students, {
		fields: [notifications.studentId],
		references: [students.id]
	}),
	tenant: one(tenants, {
		fields: [notifications.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const institutionalCredentialsRelations = relations(institutionalCredentials, ({one}) => ({
	campus: one(campuses, {
		fields: [institutionalCredentials.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [institutionalCredentials.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [institutionalCredentials.userId],
		references: [users.id]
	}),
}));

export const institutionalInfoRelations = relations(institutionalInfo, ({one}) => ({
	tenant: one(tenants, {
		fields: [institutionalInfo.tenantId],
		references: [tenants.id]
	}),
}));

export const platformMetricsRelations = relations(platformMetrics, ({one}) => ({
	tenant: one(tenants, {
		fields: [platformMetrics.tenantId],
		references: [tenants.id]
	}),
}));

export const reconciliationBatchesRelations = relations(reconciliationBatches, ({one}) => ({
	campus: one(campuses, {
		fields: [reconciliationBatches.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [reconciliationBatches.tenantId],
		references: [tenants.id]
	}),
}));

export const securityEventsRelations = relations(securityEvents, ({one}) => ({
	campus: one(campuses, {
		fields: [securityEvents.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [securityEvents.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [securityEvents.userId],
		references: [users.id]
	}),
}));

export const financialEventsRelations = relations(financialEvents, ({one}) => ({
	campus: one(campuses, {
		fields: [financialEvents.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [financialEvents.tenantId],
		references: [tenants.id]
	}),
}));

export const campusInvoicingConfigRelations = relations(campusInvoicingConfig, ({one}) => ({
	campus: one(campuses, {
		fields: [campusInvoicingConfig.campusId],
		references: [campuses.id]
	}),
	tenant: one(tenants, {
		fields: [campusInvoicingConfig.tenantId],
		references: [tenants.id]
	}),
}));

export const lateFeeCalculationsRelations = relations(lateFeeCalculations, ({one}) => ({
	charge: one(charges, {
		fields: [lateFeeCalculations.chargeId],
		references: [charges.id]
	}),
	paymentRule: one(paymentRules, {
		fields: [lateFeeCalculations.paymentRuleId],
		references: [paymentRules.id]
	}),
	tenant: one(tenants, {
		fields: [lateFeeCalculations.tenantId],
		references: [tenants.id]
	}),
}));

export const familyPaymentSourcesRelations = relations(familyPaymentSources, ({one}) => ({
	family: one(families, {
		fields: [familyPaymentSources.familyId],
		references: [families.id]
	}),
	tenant: one(tenants, {
		fields: [familyPaymentSources.tenantId],
		references: [tenants.id]
	}),
}));

export const familyStudentsRelations = relations(familyStudents, ({one}) => ({
	family: one(families, {
		fields: [familyStudents.familyId],
		references: [families.id]
	}),
	student: one(students, {
		fields: [familyStudents.studentId],
		references: [students.id]
	}),
}));

export const studentGuardianRelations = relations(studentGuardian, ({one}) => ({
	guardian: one(guardians, {
		fields: [studentGuardian.guardianId],
		references: [guardians.id]
	}),
	student: one(students, {
		fields: [studentGuardian.studentId],
		references: [students.id]
	}),
}));