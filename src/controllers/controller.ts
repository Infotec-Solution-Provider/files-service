import { Router } from "express";

class Controller {
	protected router: Router;

	constructor() {
		this.router = Router({ mergeParams: true });
	}

    get routes() {
        return this.router;
    }
}

export default Controller;
