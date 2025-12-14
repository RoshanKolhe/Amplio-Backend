// import { BindingScope, inject, injectable } from '@loopback/core';
// import { repository } from '@loopback/repository';
// import passport from 'passport';
// import { PermissionKeys } from '../authorization/permission-keys';
// import { PlanRepository, UserRepository } from '../repositories';
// import { JWTService } from '../services/jwt-service';
// import { MyUserService } from '../services/user-service';
// const GoogleStrategy = require('passport-google-oauth20').Strategy;

// @injectable({ scope: BindingScope.SINGLETON })
// export class GoogleAuthService {
//   constructor(
//     @repository(UserRepository)
//     public userRepository: UserRepository,
//     @repository(PlanRepository)
//     public planRepository: PlanRepository,
//     @inject('service.jwt.service')
//     public jwtService: JWTService,
//     @inject('service.user.service')
//     public userService: MyUserService,
//   ) {
//     this.configureGoogleStrategy();
//   }

//   configureGoogleStrategy() {
//     passport.use(
//       new GoogleStrategy(
//         {
//           clientID: process.env.CLIENT_ID!,
//           clientSecret: process.env.CLIENT_SECRET!,
//           callbackURL: `${process.env.API_ENDPOINT}/auth/google/callback`,
//           passReqToCallback: true,
//         },
//         async (
//           req: any,
//           accessToken: any,
//           refreshToken: any,
//           profile: any,
//           done: Function,
//         ) => {
//           try {
//             console.log('Google profile:', profile);
//             const email = profile.emails?.[0]?.value;
//             if (!email) {
//               return done(new Error('Email not provided by Google'), null);
//             }

//             let user = await this.userRepository.findOne({ where: { email } });
//             const plan = await this.planRepository.findOne({ where: { isFreePlan: true } });
//             if (!user) {
//               if (plan?.id) {
//                 user = await this.userRepository.create({
//                   email,
//                   fullName: profile.displayName,
//                   permissions: [PermissionKeys.CUSTOMER],
//                   password: 'google-oauth',
//                   isActive: true,
//                   currentPlanId: plan.id
//                 });
//               } else {
//                 user = await this.userRepository.create({
//                   email,
//                   fullName: profile.displayName,
//                   permissions: [PermissionKeys.CUSTOMER],
//                   password: 'google-oauth',
//                   isActive: true,
//                 });
//               }
//             }

//             const userProfile = this.userService.convertToUserProfile(user);
//             const token = await this.jwtService.generateToken(userProfile);

//             const fullUser = await this.userRepository.findById(user.id);

//             return done(null, {
//               accessToken: token,
//               user: fullUser,
//             });
//           } catch (error) {
//             console.error('Error in GoogleStrategy verify:', error);
//             return done(error, null);
//           }
//         },
//       ),
//     );
//   }
// }
