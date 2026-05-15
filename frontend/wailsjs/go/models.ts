export namespace grading {
	
	export class Interval {
	    note: number;
	    startMs: number;
	    endMs: number;
	    dynamic?: string;
	    hand?: string;
	    articulation?: string;
	    expectedVel?: number;
	
	    static createFrom(source: any = {}) {
	        return new Interval(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.note = source["note"];
	        this.startMs = source["startMs"];
	        this.endMs = source["endMs"];
	        this.dynamic = source["dynamic"];
	        this.hand = source["hand"];
	        this.articulation = source["articulation"];
	        this.expectedVel = source["expectedVel"];
	    }
	}
	export class Profile {
	    earlyToleranceMs?: number;
	    lateToleranceMs?: number;
	    perfectMs?: number;
	    goodMs?: number;
	    checkVelocity: boolean;
	    velocityTolerance?: number;
	    checkArticulation: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.earlyToleranceMs = source["earlyToleranceMs"];
	        this.lateToleranceMs = source["lateToleranceMs"];
	        this.perfectMs = source["perfectMs"];
	        this.goodMs = source["goodMs"];
	        this.checkVelocity = source["checkVelocity"];
	        this.velocityTolerance = source["velocityTolerance"];
	        this.checkArticulation = source["checkArticulation"];
	    }
	}

}

export namespace main {
	
	export class DeviceInfo {
	    id: number;
	    name: string;
	    manufacturer: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.manufacturer = source["manufacturer"];
	    }
	}
	export class ImportResult {
	    kind: string;
	    data: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.data = source["data"];
	    }
	}
	export class RecordingSummary {
	    path: string;
	    filename: string;
	    title: string;
	    composer: string;
	    copyright: string;
	    recordedAt: string;
	    durationMs: number;
	    eventCount: number;
	    fileSizeB: number;
	
	    static createFrom(source: any = {}) {
	        return new RecordingSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.filename = source["filename"];
	        this.title = source["title"];
	        this.composer = source["composer"];
	        this.copyright = source["copyright"];
	        this.recordedAt = source["recordedAt"];
	        this.durationMs = source["durationMs"];
	        this.eventCount = source["eventCount"];
	        this.fileSizeB = source["fileSizeB"];
	    }
	}

}

