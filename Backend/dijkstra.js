class MinPriorityQueue {

    constructor() {
        this.queue = [];
    }


    enqueue(node, priority) {

        this.queue.push({
            node,
            priority
        });


        this.queue.sort(
            (a,b)=>a.priority-b.priority
        );
    }


    dequeue(){

        return this.queue.shift();

    }


    isEmpty(){

        return this.queue.length===0;

    }

}



export function dijkstra(graph,start,end){


    const distance={};

    const previous={};


    const pq=new MinPriorityQueue();



    // Initialize distance

    for(const node in graph){

        distance[node]=Infinity;

        previous[node]=null;

    }



    distance[start]=0;


    pq.enqueue(start,0);



    while(!pq.isEmpty()){


        const current=pq.dequeue();


        const currentNode=current.node;



        if(currentNode===end)
            break;



        for(const neighbour of graph[currentNode]){


            const nextNode=neighbour.node;

            const weight=neighbour.weight;



            const newDistance =
            distance[currentNode]+weight;



            if(newDistance < distance[nextNode]){


                distance[nextNode]=newDistance;


                previous[nextNode]=currentNode;


                pq.enqueue(
                    nextNode,
                    newDistance
                );

            }

        }

    }




    // Create shortest path

    const path=[];

    let current=end;



    while(current!==null){

        path.unshift(current);

        current=previous[current];

    }



    return {

        path,

        distance:distance[end]

    };


}