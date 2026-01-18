

export class taskTiming {
    constructor(id) {
        this.id = id;
        this.task = {}
        this.timer = 0;

        this.start()
    }

    start() {
        this.task = {
            startTime: new Date(),
        }
        this.log();
    }

    log() {
        const currentTime = new Date();
        const duration = currentTime - this.task.startTime;
        this.timer++;
        console.log(`${this.id} [${this.timer}] Task duration: ${duration}ms`);
    }

    end() {
        this.log();
        this.task = {};
    }
}
