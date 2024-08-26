import { TestBed } from "@angular/core/testing"

import { BibleApiService } from "./bible-api.service"

describe("BibleApiService", () => {
	let service: BibleApiService

	beforeEach(() => {
		TestBed.configureTestingModule({})
		service = TestBed.inject(BibleApiService)
	})

	it("should be created", () => {
		expect(service).toBeTruthy()
	})
})
