import permissionRepository from '../repositories/permissionRepository.js';

async function list(filters) {
  return permissionRepository.findAll(filters ?? {});
}

export default { list };
