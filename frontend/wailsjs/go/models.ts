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

