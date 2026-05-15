export namespace grading {
	
	export class Interval {
	    note: number;
	    startMs: number;
	    endMs: number;
	
	    static createFrom(source: any = {}) {
	        return new Interval(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.note = source["note"];
	        this.startMs = source["startMs"];
	        this.endMs = source["endMs"];
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

}

