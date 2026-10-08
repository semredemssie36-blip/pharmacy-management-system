import healthService from '../services/healthService.js';

/** GET /api/health */
function getHealth(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      data: healthService.getHealth(),
    });
  } catch (err) {
    next(err);
  }
}

export default { getHealth };
