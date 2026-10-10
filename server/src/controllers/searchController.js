import searchService from '../services/searchService.js';

class SearchController {
  async search(req, res, next) {
    try {
      const { q, type, limit } = req.query;
      const data = await searchService.search({
        user: req.user,
        query: q,
        type,
        limit,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new SearchController();
