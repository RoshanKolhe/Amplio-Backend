// @cronJob()
// export class CheckDailyEntriesAtEvening extends CronJob {
//   constructor(
//     @repository(UserRepository)
//     public userRepository: UserRepository,
//   ) {
//     super({
//       cronTime: '0 18 * * *', // At 6 PM daily
//       onTick: async () => {
//         await this.runJob();
//       },
//       start: true,
//     });
//   }

//   async runJob() {
//     console.log('Cron job at 6 PM is running at', new Date());
//   }
// }
