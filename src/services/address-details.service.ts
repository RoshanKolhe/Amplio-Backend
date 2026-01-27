import {IsolationLevel, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {AddressDetails} from '../models';
import {AddressDetailsRepository} from '../repositories';

export class AddressDetailsService {
  constructor(
    @repository(AddressDetailsRepository)
    private addressDetailsRepository: AddressDetailsRepository,
  ) { }

  // create or update address details...
  async createOrUpdateAddressDetails(addressDetails: Partial<AddressDetails>[]): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    if (!addressDetails.length) {
      throw new HttpErrors.BadRequest('Address details payload is empty');
    }

    const addressTypes = addressDetails.map(a => a.addressType);
    if (new Set(addressTypes).size !== addressTypes.length) {
      throw new HttpErrors.BadRequest(
        'Duplicate address types are not allowed',
      );
    }

    const {usersId, identifierId, roleValue} = addressDetails[0];

    const tx =
      await this.addressDetailsRepository.dataSource.beginTransaction({
        isolationLevel: IsolationLevel.READ_COMMITTED,
      });

    try {
      const existingRegisteredAddress =
        await this.addressDetailsRepository.findOne(
          {
            where: {
              usersId,
              identifierId,
              roleValue,
              addressType: 'registered',
              isActive: true,
              isDeleted: false,
            },
          },
          {transaction: tx},
        );

      const incomingRegistered = addressDetails.find(
        a => a.addressType === 'registered',
      );

      if (!existingRegisteredAddress && !incomingRegistered) {
        throw new HttpErrors.BadRequest('Registered address is mandatory');
      }

      for (const address of addressDetails) {
        const existingAddress =
          await this.addressDetailsRepository.findOne(
            {
              where: {
                usersId: address.usersId,
                identifierId: address.identifierId,
                roleValue: address.roleValue,
                addressType: address.addressType,
                isActive: true,
                isDeleted: false,
              },
            },
            {transaction: tx},
          );

        if (existingAddress) {
          if (existingAddress.status === 1) {
            throw new HttpErrors.BadRequest(
              `${existingAddress.addressType} address is already approved and cannot be modified`,
            );
          }

          await this.addressDetailsRepository.updateById(
            existingAddress.id,
            address,
            {transaction: tx},
          );
        } else {
          await this.addressDetailsRepository.create(address, {
            transaction: tx,
          });
        }
      }

      await tx.commit();

      const finalAddresses = await this.addressDetailsRepository.find({
        where: {
          usersId,
          identifierId,
          roleValue,
          isDeleted: false,
        },
      });

      const registeredAddress =
        finalAddresses.find(a => a.addressType === 'registered') ?? null;

      const correspondenceAddress =
        finalAddresses.find(a => a.addressType === 'correspondence') ?? null;

      return {
        success: true,
        message: 'Address details saved successfully',
        registeredAddress,
        correspondenceAddress,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // fetch user address details...
  async fetchUserAddressDetails(userId: string, roleValue: string, identifierId: string): Promise<{
    success: boolean;
    message: string;
    registeredAddress: AddressDetails | null;
    correspondenceAddress: AddressDetails | null;
  }> {
    const registeredAddress = await this.addressDetailsRepository.findOne({
      where: {
        and: [
          {usersId: userId},
          {roleValue: roleValue},
          {identifierId: identifierId},
          {isActive: true},
          {isDeleted: false},
          {addressType: 'registered'}
        ]
      },
      include: [
        {relation: 'addressProof', scope: {fields: {originalFileName: true, fileName: true, id: true, fileUrl: true}}}
      ]
    });

    const correspondenceAddress = await this.addressDetailsRepository.findOne({
      where: {
        and: [
          {usersId: userId},
          {roleValue: roleValue},
          {identifierId: identifierId},
          {isActive: true},
          {isDeleted: false},
          {addressType: 'correspondence'}
        ]
      },
      include: [
        {relation: 'addressProof', scope: {fields: {originalFileName: true, fileName: true, id: true, fileUrl: true}}}
      ]
    });

    return {
      success: true,
      message: 'Address details',
      registeredAddress,
      correspondenceAddress
    }
  }

  // Approve user address details...
  async approveUserAddressDetails(
    userId: string,
    roleValue: string,
    identifierId: string,
  ): Promise<{success: boolean; message: string}> {
    const tx = await this.addressDetailsRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const addresses = await this.addressDetailsRepository.find(
        {
          where: {
            usersId: userId,
            roleValue,
            identifierId,
            isActive: true,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      const registeredAddress = addresses.find(
        a => a.addressType === 'registered',
      );
      const correspondenceAddress = addresses.find(
        a => a.addressType === 'correspondence',
      );

      if (!registeredAddress) {
        throw new HttpErrors.NotFound('Registered address not found');
      }

      if (registeredAddress.status === 1) {
        throw new HttpErrors.BadRequest('Address already approved');
      }

      const idsToUpdate = [registeredAddress.id];
      if (correspondenceAddress) idsToUpdate.push(correspondenceAddress.id);

      await this.addressDetailsRepository.updateAll(
        {
          mode: 1,
          status: 1,
          verifiedAt: new Date(),
        },
        {id: {inq: idsToUpdate}},
        {transaction: tx},
      );

      await tx.commit();
      return {success: true, message: 'Address approved successfully'};
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // Reject user address details...
  async rejectUserAddressDetails(
    userId: string,
    roleValue: string,
    identifierId: string,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    if (!reason || reason.trim().length < 3) {
      throw new HttpErrors.BadRequest('Rejection reason is required');
    }

    const tx = await this.addressDetailsRepository.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const addresses = await this.addressDetailsRepository.find(
        {
          where: {
            usersId: userId,
            roleValue,
            identifierId,
            isActive: true,
            isDeleted: false,
          },
        },
        {transaction: tx},
      );

      const registeredAddress = addresses.find(
        a => a.addressType === 'registered',
      );
      const correspondenceAddress = addresses.find(
        a => a.addressType === 'correspondence',
      );

      if (!registeredAddress) {
        throw new HttpErrors.NotFound('Registered address not found');
      }

      if (registeredAddress.status === 2) {
        throw new HttpErrors.BadRequest('Address already rejected');
      }

      const idsToUpdate = [registeredAddress.id];
      if (correspondenceAddress) idsToUpdate.push(correspondenceAddress.id);

      await this.addressDetailsRepository.updateAll(
        {
          mode: 1,
          status: 2,
          reason,
          verifiedAt: new Date(),
        },
        {id: {inq: idsToUpdate}},
        {transaction: tx},
      );

      await tx.commit();
      return {success: true, message: 'Address rejected successfully'};
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
