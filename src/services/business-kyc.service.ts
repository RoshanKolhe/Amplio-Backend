// /* eslint-disable @typescript-eslint/no-explicit-any */
// import {inject} from '@loopback/core';
// import {Filter, repository} from '@loopback/repository';
// import {HttpErrors} from '@loopback/rest';
// import { BusinessKycRepository} from '../repositories';
// // import {BondApplicationVerificationService} from './bond-application-verification.service';
// // import {BondStatusDataService} from './bond-status-data.service';
// import {BusinessKycStatusService} from './businees-kyc-status.service';

// export class BondApplicationService {
//   constructor(
//     @repository(BusinessKycRepository)
//     private bondIssueApplicationRepository: BusinessKycRepository,
//     @inject('service.businessKycStatusService.service')
//     private statusService: BusinessKycStatusService,
//     // @inject('service.BondStatusData.service')
//     // private bondStatusDataService: BondStatusDataService,
//     // @inject('service.BondApplicationVerification.service')
//     // private bondApplicationVerificationService: BondApplicationVerificationService
//   ) { }


//   // fetch single application...
//   async fetchSingleApplication(companyId: string, applicationId: string): Promise<{
//     id: string;
//     completedSteps: {
//       id: string;
//       label: string;
//       code: string;
//     }[];
//     activeStep: {
//       id: string;
//       label: string;
//       code: string;
//     }
//   }> {
//     const application = await this.bondApplicationVerificationService.verifyApplicationWithCompany(companyId, applicationId);

//     const currentStatus = await this.statusService.fetchApplicationStatusById(application.bondApplicationStatusMasterId);

//     const completedSteps = await this.statusService.fetchCompletedStepsSequence(currentStatus.sequenceOrder);

//     const activeStep = await this.statusService.fetchNextStatus(currentStatus.sequenceOrder);

//     return {
//       id: application.id,
//       completedSteps,
//       activeStep: {
//         id: activeStep.id,
//         label: activeStep.status,
//         code: activeStep.value
//       }
//     }
//   }

//   // update application status...
//   async updateApplicationStatus(applicationId: string, tx: any): Promise<{
//     success: Boolean,
//     currentStatus: {
//       id: string;
//       label: string;
//       code: string;
//     }
//   }> {
//     const application = await this.bondApplicationVerificationService.verifyApplication(applicationId);
//     const currentStatus = await this.statusService.fetchApplicationStatusById(application.bondApplicationStatusMasterId);
//     const nextStatus = await this.statusService.fetchNextStatus(currentStatus.sequenceOrder);

//     // here we will check lifeCycle before updating status...

//     await this.bondIssueApplicationRepository.updateById(application.id, {bondApplicationStatusMasterId: nextStatus.id}, {transaction: tx});

//     return {
//       success: true,
//       currentStatus: {
//         id: nextStatus.id,
//         label: nextStatus.status,
//         code: nextStatus.value
//       }
//     };
//   }

//   // fetch application data by status...
//   async fetchDataByStatusValue(companyId: string, applicationId: string, statusValue: string) {
//     const application = await this.bondApplicationVerificationService.verifyApplicationWithCompany(companyId, applicationId);

//     const currentStatus = await this.statusService.fetchApplicationStatusById(application.bondApplicationStatusMasterId);

//     const status = await this.statusService.verifyStatusValue(statusValue);

//     if (status.sequenceOrder > currentStatus.sequenceOrder) {
//       throw new HttpErrors.BadRequest('This step is not completed');
//     }

//     const data = await this.bondStatusDataService.fetchDataWithStatus(application.id, status.value);

//     return data;
//   }
// }
