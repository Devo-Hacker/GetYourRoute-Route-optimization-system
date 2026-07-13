class MinPriorityQueue {

    constructor(){
        this.queue=[];
    }
    enqueue(node,priority){
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


// Haversine distance (GPS distance)

function heuristic(node1, node2, nodes, heuristicSpeedKmph = null) {
  const lat1 = nodes[node1].lat;
  const lon1 = nodes[node1].lon;
  const lat2 = nodes[node2].lat;
  const lon2 = nodes[node2].lon;

  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  if (heuristicSpeedKmph) {
    return (distanceKm / heuristicSpeedKmph) * 60;
  }
  return distanceKm;
}



export function aStar(
    graph,
    nodes,
    start,
    end,
    heuristicSpeedKmph = null
){


    const openSet =
    new MinPriorityQueue();



    const gScore={};

    const previous={};



    for(const node in graph){

        gScore[node]=Infinity;

        previous[node]=null;

    }



    gScore[start]=0;



    openSet.enqueue(
        start,
        0
    );




    while(!openSet.isEmpty()){


        const current =
        openSet.dequeue().node;
        if(current===end)
            break;
        for(const neighbour of graph[current]){
            const next =
            neighbour.node;
            const weight =
            neighbour.weight;
            const newCost =
            gScore[current]+weight;
            if(newCost < gScore[next]){
                gScore[next]=newCost;
                previous[next]=current;
                const fScore =
                newCost +
                heuristic(
                    next,
                    end,
                    nodes,
                    heuristicSpeedKmph
                );



                openSet.enqueue(
                    next,
                    fScore
                );


            }

        }

    }




    if(gScore[end]===Infinity){

        return {

            path:[],
            distance:null,
            message:"Route not found"

        };

    }





    // Reconstruct path

    const path=[];

    let current=end;



    while(current!==null){

        path.unshift(current);

        current=previous[current];

    }




    return {

        path,

        distance:
        Number(
            gScore[end].toFixed(3)
        ),

        message:
        "A* optimized route found"

    };


}

